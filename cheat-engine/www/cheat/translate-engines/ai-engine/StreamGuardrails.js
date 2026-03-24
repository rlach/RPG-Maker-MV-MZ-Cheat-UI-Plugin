/**
 * StreamGuardrails
 * Real-time validation of streaming LLM responses
 * Monitors JSON validity, detects errors, tracks best partial responses
 */

import { StreamJsonParser } from "./StreamJsonParser.js";
import {
  STREAM_MONITOR_CHECK_INTERVAL,
  STREAM_OPEN_BRACE_MAX_CHARS,
  STREAM_CANCEL_REASON,
} from "./constants.js";

export class StreamGuardrails {
  /**
   * Create initial stream monitor state
   * @param {string[]} expectedKeys - Keys expected in JSON response
   * @returns {Object} Monitor state
   */
  static createMonitorState(expectedKeys) {
    return {
      expectedKeys: Array.isArray(expectedKeys) ? expectedKeys : [],
      expectedKeySet: new Set(expectedKeys || []),
      lastCheckedCharCount: 0,
      bestMap: null,
      bestScore: 0,
      bestIsComplete: false,
      cancelReason: null,
      cancelMeta: null,
    };
  }

  /**
   * Analyze sanitized stream text for JSON objects
   * @param {string} sanitizedText - Cleaned stream text (no think blocks)
   * @param {string[]} expectedKeys - Expected JSON keys
   * @returns {Object} {candidateMap, analysis}
   */
  static analyzeAndScan(sanitizedText, expectedKeys) {
    const scan = StreamJsonParser.scanTopLevelObjects(sanitizedText);
    const analysis = {
      firstBraceIndex: scan.firstBraceIndex,
      foundObjects: [],
      partialObjectFound: !!scan.partialObjectText,
      partialObjectKeyCount: 0,
    };

    let candidateMap = null;
    const countMatched = (map) => this.countMatchedKeys(map, expectedKeys);

    // Check complete objects
    if (scan.objects && scan.objects.length > 0) {
      for (const obj of scan.objects) {
        try {
          const parsed = StreamJsonParser.parseObjectStrict(obj.text);
          const keyParsing = StreamJsonParser.parseTopLevelKeys(obj.text);

          analysis.foundObjects.push({
            text: obj.text,
            keyCount: keyParsing.keys.length,
            duplicateKeys: keyParsing.duplicateKeys,
          });

          if (keyParsing.duplicateKeys.length === 0) {
            candidateMap = parsed;
          }
        } catch (e) {
          // Invalid object, skip
        }
      }

      // JSONL/object-sequence fallback: merge all complete top-level objects.
      const mergedMap = StreamJsonParser.mergeTopLevelObjects(sanitizedText);
      if (
        mergedMap &&
        (!candidateMap || countMatched(mergedMap) >= countMatched(candidateMap))
      ) {
        candidateMap = mergedMap;
      }
    }

    // Check partial object
    if (scan.partialObjectText) {
      const keyParsing = StreamJsonParser.parseTopLevelKeys(
        scan.partialObjectText,
      );
      analysis.partialObjectKeyCount = keyParsing.keys.length;

      // Weak repair: only checks whether stream is still structurally recoverable.
      const repairResult = StreamJsonParser.tryRepairPartialObject(
        scan.partialObjectText,
      );

      if (repairResult.ok) {
        const strictBestMapResult =
          StreamJsonParser.tryRepairPartialObjectKeepingCompleteEntries(
            scan.partialObjectText,
          );
        if (strictBestMapResult.ok && strictBestMapResult.map) {
          const partialKeyParsing = StreamJsonParser.parseTopLevelKeys(
            strictBestMapResult.repairedText,
          );
          if (
            partialKeyParsing.duplicateKeys.length === 0 &&
            (!candidateMap ||
              countMatched(strictBestMapResult.map) >=
                countMatched(candidateMap))
          ) {
            candidateMap = strictBestMapResult.map;
          }
        }
      }
    }

    return {
      candidateMap,
      analysis,
      scan,
    };
  }

  /**
   * Check if map has all expected keys
   * @param {Object} map - JSON object map
   * @param {string[]} expectedKeys - Expected key names
   * @returns {boolean}
   */
  static isMapComplete(map, expectedKeys) {
    if (!map || typeof map !== "object") {
      return false;
    }
    if (!Array.isArray(expectedKeys)) {
      return true;
    }
    return expectedKeys.every((key) => key in map);
  }

  /**
   * Count matched expected keys in map
   * @param {Object} map - JSON object map
   * @param {string[]} expectedKeys - Expected key names
   * @returns {number}
   */
  static countMatchedKeys(map, expectedKeys) {
    if (!map || typeof map !== "object" || !Array.isArray(expectedKeys)) {
      return 0;
    }
    return expectedKeys.filter((key) => key in map).length;
  }

  /**
   * Update monitor state with best matching map
   * @param {Object} state - Monitor state
   * @param {Object} candidateMap - Candidate JSON map
   */
  static updateBestState(state, candidateMap) {
    if (!candidateMap || typeof candidateMap !== "object") {
      return;
    }

    const matchCount = this.countMatchedKeys(candidateMap, state.expectedKeys);
    const isComplete = this.isMapComplete(candidateMap, state.expectedKeys);

    const score = isComplete ? matchCount + 10000 : matchCount;

    if (score > state.bestScore) {
      state.bestScore = score;
      state.bestMap = candidateMap;
      state.bestIsComplete = isComplete;
    }
  }

  /**
   * Apply stream guardrails to incoming text
   * Checks for structural validity, key coverage, and trim limits
   * @param {Object} state - Monitor state
   * @param {string} rawText - Raw stream text
   * @param {boolean} force - Force check regardless of interval
   * @returns {Object} {shouldCancel, cancelReason, bestMap}
   */
  static checkGuardrails(state, rawText, force = false) {
    if (!state || typeof state !== "object") {
      return { shouldCancel: false, cancelReason: null, bestMap: null };
    }

    const textLength = typeof rawText === "string" ? rawText.length : 0;

    // Check interval: only analyze every N chars
    const charsSinceLastCheck = textLength - state.lastCheckedCharCount;
    if (!force && charsSinceLastCheck < STREAM_MONITOR_CHECK_INTERVAL) {
      return {
        shouldCancel: false,
        cancelReason: state.cancelReason,
        bestMap: state.bestMap,
      };
    }

    state.lastCheckedCharCount = textLength;

    if (typeof rawText !== "string") {
      return {
        shouldCancel: false,
        cancelReason: null,
        bestMap: state.bestMap,
      };
    }

    // Check: opening brace must appear within limit
    const braceIndex = rawText.indexOf("{");
    if (braceIndex === -1 && rawText.length > STREAM_OPEN_BRACE_MAX_CHARS) {
      state.cancelReason = STREAM_CANCEL_REASON.NO_OPENING_BRACE;
      return {
        shouldCancel: true,
        cancelReason: state.cancelReason,
        bestMap: state.bestMap,
      };
    }

    // Analyze text for JSON structures
    const analysis = this.analyzeAndScan(rawText, state.expectedKeys);

    // Update best candidate
    if (analysis.candidateMap) {
      this.updateBestState(state, analysis.candidateMap);

      // Check for unknown keys
      const allKeys = [];
      const allDuplicateKeys = [];

      const objectTexts = (analysis.scan.objects || []).map((obj) => obj.text);
      if (analysis.scan.partialObjectText) {
        objectTexts.push(analysis.scan.partialObjectText);
      }

      for (const text of objectTexts) {
        const keyParsing = StreamJsonParser.parseTopLevelKeys(text);
        allKeys.push(...keyParsing.keys);
        allDuplicateKeys.push(...keyParsing.duplicateKeys);
      }

      for (const key of allKeys) {
        if (!state.expectedKeySet.has(key)) {
          state.cancelReason = STREAM_CANCEL_REASON.UNKNOWN_KEY;
          return {
            shouldCancel: true,
            cancelReason: state.cancelReason,
            bestMap: state.bestMap,
          };
        }
      }

      // Check for duplicate keys
      if (allDuplicateKeys.length > 0) {
        state.cancelReason = STREAM_CANCEL_REASON.DUPLICATE_KEY;
        state.cancelMeta = { duplicateKeys: allDuplicateKeys };
        return {
          shouldCancel: true,
          cancelReason: state.cancelReason,
          bestMap: state.bestMap,
        };
      }

      // Check: already found complete JSON, but stream continues
      if (state.bestIsComplete && analysis.scan.objects?.length > 0) {
        const lastObject =
          analysis.scan.objects[analysis.scan.objects.length - 1];
        const afterLastObject = analysis.scan.trailingText?.length > 0;
        if (afterLastObject && afterLastObject !== rawText.length) {
          // Stream continued after complete JSON found
          const trailingNonWhitespace =
            analysis.scan.trailingText.trim().length > 0;
          if (trailingNonWhitespace) {
            state.cancelReason = STREAM_CANCEL_REASON.COMPLETE_JSON_CONTINUED;
            return {
              shouldCancel: true,
              cancelReason: state.cancelReason,
              bestMap: state.bestMap,
            };
          }
        }
      }
    }

    return {
      shouldCancel: false,
      cancelReason: state.cancelReason,
      bestMap: state.bestMap,
    };
  }
}
