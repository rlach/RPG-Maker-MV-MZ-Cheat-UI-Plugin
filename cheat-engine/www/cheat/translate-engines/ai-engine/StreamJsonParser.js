/**
 * StreamJsonParser
 * JSON structure parsing and repair for streaming responses
 * Refactored to use JsonParserState for DRY state tracking
 */

import { JsonParserState } from "./JsonParserState.js";
import {
  STREAM_CANCEL_REASON,
  STREAM_JSON_TRIM_MAX_CHARS,
} from "./constants.js";

export class StreamJsonParser {
  /**
   * Scan text for top-level JSON objects
   * @param {string} text - Text to scan
   * @returns {Object} {firstBraceIndex, objects[], partialObjectText, trailingText}
   */
  static scanTopLevelObjects(text) {
    const result = {
      firstBraceIndex: -1,
      objects: [],
      partialObjectText: "",
      trailingText: "",
    };

    if (typeof text !== "string" || !text) {
      return result;
    }

    const firstBrace = text.indexOf("{");
    if (firstBrace === -1) {
      return result;
    }

    result.firstBraceIndex = firstBrace;
    const body = text.slice(firstBrace);

    const state = new JsonParserState();
    let objectStart = -1;

    for (let i = 0; i < body.length; i++) {
      const ch = body[i];

      if (state.isInsideString()) {
        if (state.escape) {
          state.consumeEscape();
          continue;
        }
        if (ch === "\\") {
          state.prepareEscape();
          continue;
        }
        if (ch === '"') {
          state.exitString();
        }
        continue;
      }

      if (ch === '"') {
        state.enterString(i);
        continue;
      }

      if (ch === "{") {
        if (state.isAtTopLevel()) {
          objectStart = i;
        }
        state.increaseDepth();
        continue;
      }

      if (ch === "}") {
        if (state.depth > 0) {
          state.decreaseDepth();
          if (state.isAtTopLevel() && objectStart >= 0) {
            result.objects.push({
              start: objectStart,
              end: i,
              text: body.slice(objectStart, i + 1),
            });
            objectStart = -1;
          }
        }
      }
    }

    if (state.depth > 0 && objectStart >= 0) {
      result.partialObjectText = body.slice(objectStart);
    }

    if (result.objects.length > 0) {
      const lastObject = result.objects[result.objects.length - 1];
      result.trailingText = body.slice(lastObject.end + 1);
    } else if (!result.partialObjectText) {
      result.trailingText = body;
    }

    return result;
  }

  /**
   * Parse and validate top-level keys in JSON object text
   * @param {string} objectText - JSON object text (including braces)
   * @returns {Object} {valid, keys[], duplicateKeys[]}
   */
  static parseTopLevelKeys(objectText) {
    const output = {
      valid: true,
      keys: [],
      duplicateKeys: [],
    };

    if (typeof objectText !== "string" || !objectText.trim()) {
      return output;
    }

    const state = new JsonParserState();
    let expectingKey = false;
    const seen = new Set();

    for (let i = 0; i < objectText.length; i++) {
      const ch = objectText[i];

      if (ch === '"') {
        let j = i + 1;
        let escaped = false;
        while (j < objectText.length) {
          const current = objectText[j];
          if (escaped) {
            escaped = false;
          } else if (current === "\\") {
            escaped = true;
          } else if (current === '"') {
            break;
          }
          j += 1;
        }

        if (j >= objectText.length) {
          output.valid = false;
          return output;
        }

        if (state.depth === 1 && expectingKey) {
          const literal = objectText.slice(i, j + 1);
          let key;
          try {
            key = JSON.parse(literal);
          } catch (e) {
            output.valid = false;
            return output;
          }

          let k = j + 1;
          while (k < objectText.length && /\s/.test(objectText[k])) {
            k += 1;
          }
          if (objectText[k] !== ":") {
            output.valid = false;
            return output;
          }

          output.keys.push(key);
          if (seen.has(key)) {
            output.duplicateKeys.push(key);
          }
          seen.add(key);
          expectingKey = false;
        }

        i = j;
        continue;
      }

      if (ch === "{") {
        state.increaseDepth();
        if (state.depth === 1) {
          expectingKey = true;
        }
        continue;
      }

      if (ch === "}") {
        if (state.depth > 0) {
          state.decreaseDepth();
        }
        continue;
      }

      if (ch === "," && state.depth === 1) {
        expectingKey = true;
      }
    }

    return output;
  }

  /**
   * Get JSON parser closure state from text
   * @param {string} text - Text to analyze
   * @returns {JsonParserState}
   */
  static getJsonClosureState(text) {
    if (typeof text !== "string") {
      return new JsonParserState();
    }

    const state = new JsonParserState();

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (state.isInsideString()) {
        if (state.escape) {
          state.consumeEscape();
          continue;
        }
        if (ch === "\\") {
          state.prepareEscape();
          continue;
        }
        if (ch === '"') {
          state.exitString();
        }
        continue;
      }

      if (ch === '"') {
        state.enterString(i);
        continue;
      }

      if (ch === "{") {
        state.increaseDepth();
        continue;
      }

      if (ch === "}" && state.depth > 0) {
        state.decreaseDepth();
      }
    }

    return state;
  }

  /**
   * Find last top-level comma in text
   * @param {string} text - Text to search
   * @returns {number} Index of last comma, or -1
   */
  static findLastTopLevelComma(text) {
    if (typeof text !== "string" || !text) {
      return -1;
    }

    const state = new JsonParserState();
    let lastCommaIndex = -1;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (state.isInsideString()) {
        if (state.escape) {
          state.consumeEscape();
          continue;
        }
        if (ch === "\\") {
          state.prepareEscape();
          continue;
        }
        if (ch === '"') {
          state.exitString();
        }
        continue;
      }

      if (ch === '"') {
        state.enterString(i);
        continue;
      }

      if (ch === "{") {
        state.increaseDepth();
        continue;
      }

      if (ch === "}") {
        if (state.depth > 0) {
          state.decreaseDepth();
        }
        continue;
      }

      if (ch === "," && state.depth === 1) {
        lastCommaIndex = i;
      }
    }

    return lastCommaIndex;
  }

  /**
   * Auto-close incomplete JSON object text
   * @param {string} text - Incomplete JSON text
   * @returns {string}
   */
  static autoCloseJsonObjectText(text) {
    if (typeof text !== "string") {
      return "{}";
    }

    const closureState = this.getJsonClosureState(text);

    let out = text;
    if (closureState.isInsideString()) {
      if (closureState.escape) {
        out += "\\";
      }
      out += '"';
    }

    while (closureState.depth > 0) {
      out += "}";
      closureState.decreaseDepth();
    }

    return out;
  }

  /**
   * Parse and validate JSON object text strictly
   * @param {string} text - JSON text
   * @returns {Object} Parsed object
   * @throws Error if not valid JSON object
   */
  static parseObjectStrict(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not_json_object");
    }
    return parsed;
  }

  /**
   * Extract first JSON-like object from text
   * @param {string} text - Text potentially containing JSON
   * @returns {string} Extracted JSON text
   */
  static extractJsonLike(text) {
    if (typeof text !== "string") {
      return "{}";
    }

    const scan = this.scanTopLevelObjects(text);
    if (scan.objects && scan.objects.length > 0) {
      return scan.objects[0].text;
    }

    if (scan.partialObjectText) {
      return this.autoCloseJsonObjectText(scan.partialObjectText);
    }

    return "{}";
  }

  static extractBestJsonLike(text, expectedKeys = []) {
    if (typeof text !== "string") {
      return "{}";
    }

    const scan = this.scanTopLevelObjects(text);
    if (scan.objects && scan.objects.length > 0) {
      if (!Array.isArray(expectedKeys) || expectedKeys.length === 0) {
        return scan.objects[scan.objects.length - 1].text;
      }

      const expectedSet = new Set(expectedKeys);
      let bestText = scan.objects[scan.objects.length - 1].text;
      let bestScore = -1;

      for (const obj of scan.objects) {
        let parsed;
        try {
          parsed = this.parseObjectStrict(obj.text);
        } catch (e) {
          continue;
        }

        const keys = Object.keys(parsed);
        let score = 0;
        for (const key of keys) {
          if (expectedSet.has(key)) {
            score += 1;
          }
        }

        if (score >= bestScore) {
          bestScore = score;
          bestText = obj.text;
        }
      }

      return bestText;
    }

    if (scan.partialObjectText) {
      return this.autoCloseJsonObjectText(scan.partialObjectText);
    }

    return "{}";
  }

  static extractBestCompleteJsonLike(text, expectedKeys = []) {
    if (typeof text !== "string") {
      return "{}";
    }

    const scan = this.scanTopLevelObjects(text);
    if (scan.objects && scan.objects.length > 0) {
      if (!Array.isArray(expectedKeys) || expectedKeys.length === 0) {
        return scan.objects[scan.objects.length - 1].text;
      }

      const expectedSet = new Set(expectedKeys);
      let bestText = scan.objects[scan.objects.length - 1].text;
      let bestScore = -1;

      for (const obj of scan.objects) {
        let parsed;
        try {
          parsed = this.parseObjectStrict(obj.text);
        } catch (e) {
          continue;
        }

        const keys = Object.keys(parsed);
        let score = 0;
        for (const key of keys) {
          if (expectedSet.has(key)) {
            score += 1;
          }
        }

        if (score >= bestScore) {
          bestScore = score;
          bestText = obj.text;
        }
      }

      return bestText;
    }

    return "{}";
  }

  /**
   * Merge multiple top-level JSON objects found in text (JSONL/object sequence)
   * @param {string} text - Text potentially containing multiple JSON objects
   * @returns {Object|null} Merged object map or null when no valid objects
   */
  static mergeTopLevelObjects(text) {
    if (typeof text !== "string" || !text) {
      return null;
    }

    const scan = this.scanTopLevelObjects(text);
    if (!scan.objects || scan.objects.length === 0) {
      return null;
    }

    const merged = {};
    let hasAny = false;

    for (const obj of scan.objects) {
      let parsed;
      try {
        parsed = this.parseObjectStrict(obj.text);
      } catch (e) {
        continue;
      }

      for (const [key, value] of Object.entries(parsed)) {
        merged[key] = value;
        hasAny = true;
      }
    }

    return hasAny ? merged : null;
  }

  /**
   * Attempt to repair partial JSON object
   * @param {string} partialText - Incomplete JSON text
   * @param {number} trimLimit - Maximum chars to trim
   * @returns {Object} {ok, map?, reason?, trimmedChars?, repairedText?}
   */
  static tryRepairPartialObject(
    partialText,
    trimLimit = STREAM_JSON_TRIM_MAX_CHARS,
  ) {
    const closureState = this.getJsonClosureState(partialText);

    if (closureState.isInsideString()) {
      const openStringStart =
        closureState.openStringStartIndex >= 0
          ? closureState.openStringStartIndex
          : 0;
      const openStringTailChars = partialText.length - openStringStart;

      if (openStringTailChars > trimLimit) {
        return {
          ok: false,
          reason: STREAM_CANCEL_REASON.TRIM_TOO_LONG,
          trimmedChars: openStringTailChars,
        };
      }

      const initialCandidate = this.autoCloseJsonObjectText(partialText);
      try {
        return {
          ok: true,
          map: this.parseObjectStrict(initialCandidate),
          trimmedChars: 0,
          repairedText: initialCandidate,
        };
      } catch (e) {
        // Continue to fallback
      }
    } else {
      const initialCandidate = this.autoCloseJsonObjectText(partialText);
      try {
        return {
          ok: true,
          map: this.parseObjectStrict(initialCandidate),
          trimmedChars: 0,
          repairedText: initialCandidate,
        };
      } catch (e) {
        // Continue to fallback
      }
    }

    const lastComma = this.findLastTopLevelComma(partialText);
    let trimmedChars;
    let fallbackCandidate;

    if (lastComma >= 0) {
      trimmedChars = partialText.length - (lastComma + 1);
      fallbackCandidate = `${partialText.slice(0, lastComma)}}`;
    } else {
      trimmedChars = Math.max(0, partialText.length - 1);
      fallbackCandidate = "{}";
    }

    if (trimmedChars > trimLimit) {
      return {
        ok: false,
        reason: STREAM_CANCEL_REASON.TRIM_TOO_LONG,
        trimmedChars,
      };
    }

    try {
      return {
        ok: true,
        map: this.parseObjectStrict(fallbackCandidate),
        trimmedChars,
        repairedText: fallbackCandidate,
      };
    } catch (e) {
      return {
        ok: false,
        reason: STREAM_CANCEL_REASON.INVALID_JSON_PROGRESS,
        trimmedChars,
      };
    }
  }

  /**
   * Attempt to repair partial JSON object while keeping only fully complete key-value pairs.
   * Unlike tryRepairPartialObject(), this variant never keeps a key whose value must be
   * synthetically closed as an unterminated string.
   * @param {string} partialText - Incomplete JSON text
   * @param {number} trimLimit - Maximum chars to trim
   * @returns {Object} {ok, map?, reason?, trimmedChars?, repairedText?}
   */
  static tryRepairPartialObjectKeepingCompleteEntries(
    partialText,
    trimLimit = STREAM_JSON_TRIM_MAX_CHARS,
  ) {
    if (typeof partialText !== "string" || !partialText.trim()) {
      return {
        ok: false,
        reason: STREAM_CANCEL_REASON.INVALID_JSON_PROGRESS,
        trimmedChars: 0,
      };
    }

    const closureState = this.getJsonClosureState(partialText);
    const candidates = [];

    // If we are not inside a string, we can try brace-only closure first.
    if (!closureState.isInsideString()) {
      candidates.push({
        text: this.autoCloseJsonObjectText(partialText),
        trimmedChars: 0,
      });
    }

    // Then progressively trim the currently in-flight pair (and if needed more)
    // by removing content after the last top-level comma.
    let cursor = partialText;
    while (true) {
      const lastComma = this.findLastTopLevelComma(cursor);
      if (lastComma < 0) {
        break;
      }

      const trimmedChars = partialText.length - (lastComma + 1);
      if (trimmedChars > trimLimit) {
        return {
          ok: false,
          reason: STREAM_CANCEL_REASON.TRIM_TOO_LONG,
          trimmedChars,
        };
      }

      candidates.push({
        text: `${cursor.slice(0, lastComma)}}`,
        trimmedChars,
      });

      cursor = cursor.slice(0, lastComma);
    }

    candidates.push({
      text: "{}",
      trimmedChars: Math.max(0, partialText.length - 1),
    });

    const seen = new Set();
    for (const candidate of candidates) {
      if (!candidate || typeof candidate.text !== "string") {
        continue;
      }
      if (seen.has(candidate.text)) {
        continue;
      }
      seen.add(candidate.text);

      try {
        return {
          ok: true,
          map: this.parseObjectStrict(candidate.text),
          trimmedChars: candidate.trimmedChars,
          repairedText: candidate.text,
        };
      } catch (e) {
        // Try next stricter candidate.
      }
    }

    return {
      ok: false,
      reason: STREAM_CANCEL_REASON.INVALID_JSON_PROGRESS,
      trimmedChars: 0,
    };
  }
}
