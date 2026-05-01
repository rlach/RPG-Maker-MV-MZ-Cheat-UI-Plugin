/**
 * StreamGuardrails
 * Real-time validation of streaming LLM responses
 * Monitors JSON validity, detects errors, tracks best partial responses
 */

import { StreamJsonParser } from './StreamJsonParser.js';
import {
    STREAM_MONITOR_CHECK_INTERVAL,
    STREAM_OPEN_BRACE_MAX_CHARS,
    STREAM_CANCEL_REASON,
} from './constants.js';

export class StreamGuardrails {
    static normalizeBannedPhrases(phrases) {
        if (!Array.isArray(phrases)) {
            return [];
        }

        const seen = new Set();
        const normalized = [];
        for (const entry of phrases) {
            const phrase = typeof entry === 'string' ? entry.trim() : '';
            if (!phrase) {
                continue;
            }
            const key = phrase.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            normalized.push({ phrase, key });
        }

        return normalized;
    }

    static findBannedPhraseInJsonText(jsonText, normalizedPhrases) {
        if (
            typeof jsonText !== 'string' ||
            !jsonText ||
            !Array.isArray(normalizedPhrases) ||
            normalizedPhrases.length === 0
        ) {
            return null;
        }

        const lowerJson = jsonText.toLowerCase();
        for (const item of normalizedPhrases) {
            if (item && item.key && lowerJson.includes(item.key)) {
                return item.phrase;
            }
        }

        return null;
    }

    static findBannedPhraseInScan(scan, normalizedPhrases) {
        if (!scan || !Array.isArray(normalizedPhrases) || normalizedPhrases.length === 0) {
            return null;
        }

        if (Array.isArray(scan.objects)) {
            for (const obj of scan.objects) {
                const hit = this.findBannedPhraseInJsonText(obj?.text, normalizedPhrases);
                if (hit) {
                    return hit;
                }
            }
        }

        return this.findBannedPhraseInJsonText(scan.partialObjectText, normalizedPhrases);
    }

    static extractInFlightTopLevelKey(partialObjectText) {
        if (typeof partialObjectText !== 'string' || !partialObjectText) {
            return null;
        }

        let depth = 0;
        let inString = false;
        let escape = false;
        let lastTopLevelPairDelimiterIndex = -1;

        for (let i = 0; i < partialObjectText.length; i++) {
            const ch = partialObjectText[i];

            if (inString) {
                if (escape) {
                    escape = false;
                    continue;
                }
                if (ch === '\\') {
                    escape = true;
                    continue;
                }
                if (ch === '"') {
                    inString = false;
                }
                continue;
            }

            if (ch === '"') {
                inString = true;
                continue;
            }

            if (ch === '{') {
                depth += 1;
                if (depth === 1 && lastTopLevelPairDelimiterIndex < 0) {
                    lastTopLevelPairDelimiterIndex = i;
                }
                continue;
            }

            if (ch === '}') {
                if (depth > 0) {
                    depth -= 1;
                }
                continue;
            }

            if (ch === ',' && depth === 1) {
                lastTopLevelPairDelimiterIndex = i;
            }
        }

        if (lastTopLevelPairDelimiterIndex < 0) {
            return null;
        }

        const tail = partialObjectText
            .slice(lastTopLevelPairDelimiterIndex + 1)
            .replace(/^\s+/, '');

        if (!tail.startsWith('"')) {
            return null;
        }

        let key = '';
        let escaped = false;
        for (let i = 1; i < tail.length; i++) {
            const ch = tail[i];

            if (escaped) {
                key += ch;
                escaped = false;
                continue;
            }

            if (ch === '\\') {
                escaped = true;
                continue;
            }

            if (ch === '"') {
                return {
                    key,
                    isClosed: true,
                };
            }

            key += ch;
        }

        return {
            key,
            isClosed: false,
        };
    }

    static isExpectedKeyProgress(expectedKeys, key, isClosed) {
        if (!Array.isArray(expectedKeys) || expectedKeys.length === 0) {
            return true;
        }

        if (isClosed) {
            return expectedKeys.includes(key);
        }

        return expectedKeys.some((expectedKey) => expectedKey.startsWith(key));
    }

    static buildValueLengthSettings(expectedKeys, options = {}) {
        const multiplierRaw = Number(options.lengthMultiplierForMaxLength);
        const minimumRaw = Number(options.minimumMaxLength);

        const lengthMultiplierForMaxLength =
            Number.isFinite(multiplierRaw) && multiplierRaw > 0 ? multiplierRaw : 3;
        const minimumMaxLength =
            Number.isFinite(minimumRaw) && minimumRaw > 0
                ? Math.max(1, Math.floor(minimumRaw))
                : 30;

        const sourceLengths =
            options && typeof options.expectedValueLengthsByKey === 'object'
                ? options.expectedValueLengthsByKey
                : {};

        const limits = {};
        let maxValueLengthLimit = minimumMaxLength;

        for (const key of Array.isArray(expectedKeys) ? expectedKeys : []) {
            const sourceLengthRaw = Number(sourceLengths[key]);
            const sourceLength =
                Number.isFinite(sourceLengthRaw) && sourceLengthRaw >= 0 ? sourceLengthRaw : 0;

            const dynamicLimit = Math.ceil(sourceLength * lengthMultiplierForMaxLength);
            const maxLength = Math.max(minimumMaxLength, dynamicLimit);
            limits[key] = maxLength;
            if (maxLength > maxValueLengthLimit) {
                maxValueLengthLimit = maxLength;
            }
        }

        return {
            valueLengthLimitsByKey: limits,
            lengthMultiplierForMaxLength,
            minimumMaxLength,
            maxValueLengthLimit,
        };
    }

    static extractInFlightTopLevelValueString(partialObjectText) {
        if (typeof partialObjectText !== 'string' || !partialObjectText) {
            return null;
        }

        let depth = 0;
        let inString = false;
        let escape = false;
        let mode = null; // 'key' | 'value' | 'other'

        let expectingKey = false;
        let expectingValue = false;
        let currentKey = null;

        let keyBuffer = '';
        let valueLength = 0;
        let valueKey = null;

        for (let i = 0; i < partialObjectText.length; i++) {
            const ch = partialObjectText[i];

            if (inString) {
                if (mode === 'key') {
                    if (escape) {
                        keyBuffer += ch;
                        escape = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escape = true;
                        continue;
                    }
                    if (ch === '"') {
                        inString = false;
                        mode = null;
                        currentKey = keyBuffer;
                        expectingKey = false;
                        continue;
                    }
                    keyBuffer += ch;
                    continue;
                }

                if (mode === 'value') {
                    if (escape) {
                        valueLength += 1;
                        escape = false;
                        continue;
                    }
                    if (ch === '\\') {
                        escape = true;
                        continue;
                    }
                    if (ch === '"') {
                        inString = false;
                        mode = null;
                        expectingValue = false;
                        currentKey = null;
                        valueKey = null;
                        continue;
                    }
                    valueLength += 1;
                    continue;
                }

                if (escape) {
                    escape = false;
                    continue;
                }
                if (ch === '\\') {
                    escape = true;
                    continue;
                }
                if (ch === '"') {
                    inString = false;
                    mode = null;
                }
                continue;
            }

            if (ch === '"') {
                inString = true;
                escape = false;

                if (depth === 1 && expectingKey) {
                    mode = 'key';
                    keyBuffer = '';
                    continue;
                }

                if (depth === 1 && expectingValue) {
                    mode = 'value';
                    valueLength = 0;
                    valueKey = currentKey;
                    continue;
                }

                mode = 'other';
                continue;
            }

            if (ch === '{') {
                depth += 1;
                if (depth === 1) {
                    expectingKey = true;
                    expectingValue = false;
                    currentKey = null;
                }
                continue;
            }

            if (ch === '}') {
                if (depth > 0) {
                    depth -= 1;
                }
                continue;
            }

            if (depth !== 1) {
                continue;
            }

            if (ch === ',') {
                expectingKey = true;
                expectingValue = false;
                currentKey = null;
                continue;
            }

            if (ch === ':' && currentKey !== null) {
                expectingValue = true;
                continue;
            }

            if (expectingValue && !/\s/.test(ch)) {
                // Non-string value started; we only enforce string-value lengths.
                expectingValue = false;
                currentKey = null;
            }
        }

        if (inString && mode === 'value') {
            return {
                key: valueKey || currentKey || '',
                valueLength,
            };
        }

        return null;
    }

    /**
     * Create initial stream monitor state
     * @param {string[]} expectedKeys - Keys expected in JSON response
     * @returns {Object} Monitor state
     */
    static createMonitorState(expectedKeys, options = {}) {
        const bannedPhrases = this.normalizeBannedPhrases(options.bannedPhrases);
        const valueLengthSettings = this.buildValueLengthSettings(expectedKeys, options);

        return {
            expectedKeys: Array.isArray(expectedKeys) ? expectedKeys : [],
            expectedKeySet: new Set(expectedKeys || []),
            bannedPhrases,
            valueLengthLimitsByKey: valueLengthSettings.valueLengthLimitsByKey,
            lengthMultiplierForMaxLength: valueLengthSettings.lengthMultiplierForMaxLength,
            minimumMaxLength: valueLengthSettings.minimumMaxLength,
            maxValueLengthLimit: valueLengthSettings.maxValueLengthLimit,
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
    static analyzeAndScan(sanitizedText, expectedKeys, options = {}) {
        const scan = StreamJsonParser.scanTopLevelObjects(sanitizedText);
        const repairTrimLimit =
            Number.isFinite(options.repairTrimLimit) && options.repairTrimLimit > 0
                ? options.repairTrimLimit
                : Number.POSITIVE_INFINITY;

        /** @type {Array<{text: string, keyCount: number, duplicateKeys: string[]}>} */
        const foundObjects = [];
        const analysis = {
            firstBraceIndex: scan.firstBraceIndex,
            foundObjects,
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
            const keyParsing = StreamJsonParser.parseTopLevelKeys(scan.partialObjectText);
            analysis.partialObjectKeyCount = keyParsing.keys.length;

            // Weak repair: only checks whether stream is still structurally recoverable.
            const repairResult = StreamJsonParser.tryRepairPartialObject(
                scan.partialObjectText,
                repairTrimLimit
            );

            if (repairResult.ok) {
                const strictBestMapResult =
                    StreamJsonParser.tryRepairPartialObjectKeepingCompleteEntries(
                        scan.partialObjectText,
                        repairTrimLimit
                    );
                if (strictBestMapResult.ok && strictBestMapResult.map) {
                    const partialKeyParsing = StreamJsonParser.parseTopLevelKeys(
                        strictBestMapResult.repairedText
                    );
                    if (
                        partialKeyParsing.duplicateKeys.length === 0 &&
                        (!candidateMap ||
                            countMatched(strictBestMapResult.map) >= countMatched(candidateMap))
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
        if (!map || typeof map !== 'object') {
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
        if (!map || typeof map !== 'object' || !Array.isArray(expectedKeys)) {
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
        if (!candidateMap || typeof candidateMap !== 'object') {
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
        if (!state || typeof state !== 'object') {
            return { shouldCancel: false, cancelReason: null, bestMap: null };
        }

        const textLength = typeof rawText === 'string' ? rawText.length : 0;

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

        if (typeof rawText !== 'string') {
            return {
                shouldCancel: false,
                cancelReason: null,
                bestMap: state.bestMap,
            };
        }

        // Check: opening brace must appear within limit
        const braceIndex = rawText.indexOf('{');
        if (braceIndex === -1 && rawText.length > STREAM_OPEN_BRACE_MAX_CHARS) {
            state.cancelReason = STREAM_CANCEL_REASON.NO_OPENING_BRACE;
            return {
                shouldCancel: true,
                cancelReason: state.cancelReason,
                bestMap: state.bestMap,
            };
        }

        // Analyze text for JSON structures
        const analysis = this.analyzeAndScan(rawText, state.expectedKeys, {
            repairTrimLimit: state.maxValueLengthLimit,
        });

        const bannedPhrase = this.findBannedPhraseInScan(analysis.scan, state.bannedPhrases);
        if (bannedPhrase) {
            state.cancelReason = STREAM_CANCEL_REASON.BANNED_PHRASE;
            state.cancelMeta = { phrase: bannedPhrase };
            return {
                shouldCancel: true,
                cancelReason: state.cancelReason,
                bestMap: state.bestMap,
            };
        }

        // Guardrail: trim-too-long in partial object must cancel immediately.
        if (analysis.scan.partialObjectText) {
            const repairResult = StreamJsonParser.tryRepairPartialObject(
                analysis.scan.partialObjectText,
                state.maxValueLengthLimit
            );
            if (!repairResult.ok && repairResult.reason === STREAM_CANCEL_REASON.TRIM_TOO_LONG) {
                state.cancelReason = STREAM_CANCEL_REASON.TRIM_TOO_LONG;
                state.cancelMeta = { trimmedChars: repairResult.trimmedChars };
                return {
                    shouldCancel: true,
                    cancelReason: state.cancelReason,
                    bestMap: state.bestMap,
                };
            }

            const strictRepairResult =
                StreamJsonParser.tryRepairPartialObjectKeepingCompleteEntries(
                    analysis.scan.partialObjectText,
                    state.maxValueLengthLimit
                );
            if (
                !strictRepairResult.ok &&
                strictRepairResult.reason === STREAM_CANCEL_REASON.TRIM_TOO_LONG
            ) {
                state.cancelReason = STREAM_CANCEL_REASON.TRIM_TOO_LONG;
                state.cancelMeta = { trimmedChars: strictRepairResult.trimmedChars };
                return {
                    shouldCancel: true,
                    cancelReason: state.cancelReason,
                    bestMap: state.bestMap,
                };
            }

            // Guardrail: detect obvious malformed JSON progress (e.g. stray tokens after value)
            // when parser is not simply waiting for string closure.
            const closureState = StreamJsonParser.getJsonClosureState(
                analysis.scan.partialObjectText
            );
            const partialKeyParsing = StreamJsonParser.parseTopLevelKeys(
                analysis.scan.partialObjectText
            );
            if (!closureState.isInsideString() && !partialKeyParsing.valid) {
                state.cancelReason = STREAM_CANCEL_REASON.INVALID_JSON_PROGRESS;
                return {
                    shouldCancel: true,
                    cancelReason: state.cancelReason,
                    bestMap: state.bestMap,
                };
            }

            // Guardrail: track currently generated key and abort early on impossible keys.
            const inFlightKey = this.extractInFlightTopLevelKey(analysis.scan.partialObjectText);
            if (inFlightKey) {
                if (
                    !this.isExpectedKeyProgress(
                        state.expectedKeys,
                        inFlightKey.key,
                        inFlightKey.isClosed
                    )
                ) {
                    state.cancelReason = STREAM_CANCEL_REASON.UNKNOWN_KEY;
                    state.cancelMeta = {
                        key: inFlightKey.key,
                        isClosed: inFlightKey.isClosed,
                        reason: inFlightKey.isClosed
                            ? 'closed_key_not_expected'
                            : 'key_prefix_not_expected',
                    };
                    return {
                        shouldCancel: true,
                        cancelReason: state.cancelReason,
                        bestMap: state.bestMap,
                    };
                }
            }

            const inFlightValue = this.extractInFlightTopLevelValueString(
                analysis.scan.partialObjectText
            );
            if (inFlightValue && inFlightValue.key) {
                const maxLengthForKey =
                    state.valueLengthLimitsByKey[inFlightValue.key] || state.minimumMaxLength;

                if (inFlightValue.valueLength > maxLengthForKey) {
                    state.cancelReason = STREAM_CANCEL_REASON.TRIM_TOO_LONG;
                    state.cancelMeta = {
                        key: inFlightValue.key,
                        valueLength: inFlightValue.valueLength,
                        maxLength: maxLengthForKey,
                        reason: 'value_too_long',
                    };
                    return {
                        shouldCancel: true,
                        cancelReason: state.cancelReason,
                        bestMap: state.bestMap,
                    };
                }
            }
        }

        // Update best candidate
        if (analysis.candidateMap) {
            this.updateBestState(state, analysis.candidateMap);

            // Check: already found complete JSON, but stream continues
            if (state.bestIsComplete && analysis.scan.objects?.length > 0) {
                const trailingText = analysis.scan.trailingText || '';
                if (trailingText.length > 0) {
                    // Stream continued after complete JSON found
                    const trailingNonWhitespace = trailingText.trim().length > 0;
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

        // Check for unknown keys / duplicates even when no candidateMap was found.
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
                state.cancelMeta = { key, reason: 'parsed_unknown_key' };
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

        return {
            shouldCancel: false,
            cancelReason: state.cancelReason,
            bestMap: state.bestMap,
        };
    }
}
