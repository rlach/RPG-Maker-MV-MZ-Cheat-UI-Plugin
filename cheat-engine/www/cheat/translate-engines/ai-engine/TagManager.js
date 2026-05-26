/**
 * TagManager
 * Game script tag escaping/unescaping
 * Handles preprocessing \V[5] -> [b=xy5] and postprocessing [b=xy5] -> \V[5]
 */

import {
    LLM_MAX_CONSECUTIVE_IDENTICAL_CHARS,
    TAG_BRACKET,
    TAG_CONFIGS,
    TAG_STYLE,
    TAG_TYPE,
} from './constants.js';
import { ensureTranslateCacheRuntime } from '../../js/TranslateCacheRuntime.js';

const BRACKET_CLOSE_BY_OPEN = Object.freeze({
    [TAG_BRACKET.ANGLE]: '>',
    [TAG_BRACKET.SQUARE]: ']',
    [TAG_BRACKET.ROUND]: ')',
    [TAG_BRACKET.CURLY]: '}',
});

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ESCAPE_PREFIX_PATTERN = String.raw`(?:\\|\u001b)`;
const SPACE_RUN_TRIGGER_THRESHOLD = LLM_MAX_CONSECUTIVE_IDENTICAL_CHARS + 1;
const ESCAPE_TAG_SYMBOL_START_CLASS = 'A-Za-z${}|.!><^';
const PROTECTED_B_TAG_PREFIX = '__protected_b_tag__';
const LONG_RUN_TAG_CONFIGS = Object.freeze([
    { tagId: 'sp', character: ' ' },
    { tagId: 'sw', character: '　' },
]);
const SIMPLE_NEWLINE_PROMPT_DEFAULT =
    'This tag represents newline, put it in places where newline typically would appear';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const makeTagIdSeed = (value) =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

const cloneTagConfig = (config) => ({ ...config });

export class TagManager {
    constructor(runtime) {
        this.runtime = runtime;
        this.tagEntries = [];
        this.customParameterEntries = [];
        this.longRunEntries = [];
        this.simpleNEntry = {
            key: 'simpleN',
            description: 'simpleN',
            tagId: 'sn',
            requiredConsistency: true,
            addSpace: false,
            reservedWidth: 0,
            extraPromptForLlm: SIMPLE_NEWLINE_PROMPT_DEFAULT,
            prePattern: /\n/g,
            postPattern: /\[b=sn\]/g,
        };
        this.simpleNConfig = {
            requiredConsistency: true,
            reservedWidth: 0,
            extraPromptForLlm: SIMPLE_NEWLINE_PROMPT_DEFAULT,
        };
        this.spaceRunEntry = null;
        this.baseTagConfigs = TAG_CONFIGS.map(cloneTagConfig);
        this.customTagConfigs = [];
        this.initializeTagRegistry();
    }

    setSimpleNConfig(config = {}, options = {}) {
        const parsedReservedWidth = Number(config?.reservedWidth);
        const normalizedPrompt =
            typeof config?.extraPromptForLlm === 'string' ? config.extraPromptForLlm.trim() : '';

        this.simpleNConfig = {
            requiredConsistency: config?.requiredConsistency === true,
            reservedWidth:
                Number.isFinite(parsedReservedWidth) && parsedReservedWidth > 0
                    ? Math.floor(parsedReservedWidth)
                    : 0,
            extraPromptForLlm: normalizedPrompt || SIMPLE_NEWLINE_PROMPT_DEFAULT,
        };

        if (options?.reinitialize !== false) {
            this.initializeTagRegistry();
        }
    }

    buildNormalizedLongRunTagConfigs() {
        const normalized = [];
        const seenCharacters = new Set();

        for (const config of LONG_RUN_TAG_CONFIGS) {
            const character = typeof config?.character === 'string' ? config.character : '';
            if (!character || seenCharacters.has(character)) {
                continue;
            }

            const tagId =
                typeof config?.tagId === 'string'
                    ? config.tagId
                          .trim()
                          .toLowerCase()
                          .replace(/[^a-z0-9]/g, '')
                          .slice(0, 2)
                    : '';

            normalized.push({
                character,
                tagId,
            });
            seenCharacters.add(character);
        }

        return normalized;
    }

    createLongRunEntry(config, tagId, index) {
        const character = config.character;
        const codePoint = character.codePointAt(0);
        const safeCodePoint = Number.isFinite(codePoint)
            ? codePoint.toString(16).toUpperCase()
            : `IDX${index}`;
        const escapedCharacter = escapeRegExp(character);
        const key = `longRun${safeCodePoint}`;

        return {
            key,
            description: `longRun:${safeCodePoint}`,
            tagId,
            character,
            requiredConsistency: true,
            prePattern: new RegExp(`${escapedCharacter}{${SPACE_RUN_TRIGGER_THRESHOLD},}`, 'g'),
            postPattern: new RegExp(String.raw`\[b=${tagId}(\d+)\]`, 'gi'),
        };
    }

    setBaseTagConfigs(baseTagConfigs = []) {
        this.baseTagConfigs = Array.isArray(baseTagConfigs)
            ? baseTagConfigs.map(cloneTagConfig)
            : TAG_CONFIGS.map(cloneTagConfig);
        this.initializeTagRegistry();
    }

    setCustomTagConfigs(customTagConfigs = []) {
        this.customTagConfigs = Array.isArray(customTagConfigs)
            ? customTagConfigs.map(cloneTagConfig)
            : [];
        this.initializeTagRegistry();
    }

    getPatternSignature(config) {
        const symbol = String(config.tagSymbol || '').toLowerCase();
        const type = config.type || '';
        const style = config.style || TAG_STYLE.ESCAPE;
        const bracket = config.type === TAG_TYPE.WITH_CUSTOM_PARAMETER ? config.bracket || '' : '';
        return `${style}:${type}:${symbol}:${bracket}`;
    }

    /**
     * Returns a Set of normalized detection patterns that are already covered by
     * registered tag entries. Used by the unknown tag scanner to filter false positives.
     * Pattern format matches scanForUnknownTags output: e.g. "\\FF[…]", "\\V[N]", "\\G"
     */
    getRegisteredDetectionPatterns() {
        const patterns = new Set();
        for (const entry of this.tagEntries) {
            const sym = String(entry.tagSymbol || '');
            if (!sym) continue;

            if (entry.style === TAG_STYLE.XML) {
                // XML tags are not detected by ESC_TAG_RE, skip
                continue;
            }

            if (entry.type === TAG_TYPE.WITHOUT_PARAMETER) {
                patterns.add(`\\${sym}`);
            } else if (entry.type === TAG_TYPE.WITH_NUMERIC_PARAMETER) {
                patterns.add(`\\${sym}[N]`);
            } else if (entry.type === TAG_TYPE.WITH_CUSTOM_PARAMETER) {
                const bracket = entry.bracket || '[';
                if (bracket === '[') {
                    patterns.add(`\\${sym}[N]`);
                    patterns.add(`\\${sym}[…]`);
                } else if (bracket === '<') {
                    patterns.add(`\\${sym}<…>`);
                } else if (bracket === '(') {
                    patterns.add(`\\${sym}(…)`);
                } else if (bracket === '{') {
                    patterns.add(`\\${sym}{…}`);
                }
            }
        }
        return patterns;
    }

    initializeTagRegistry() {
        const configs = [...this.baseTagConfigs, ...this.customTagConfigs];
        const longRunTagConfigs = this.buildNormalizedLongRunTagConfigs();
        const usedTagIds = new Set();
        const usedLongRunTagIds = new Set();
        const usedPatternSignatures = new Set();
        const simpleNId = 'sn';

        // Keep newline tag stable across sessions, prompts and LLM responses.
        usedTagIds.add(simpleNId);

        for (const config of longRunTagConfigs) {
            if (config.tagId?.length === 2) {
                usedTagIds.add(config.tagId);
            }
        }

        this.tagEntries = [];
        this.customParameterEntries = [];
        this.longRunEntries = [];

        for (let i = 0; i < configs.length; i++) {
            const config = this.validateAndNormalizeConfig(configs[i], i);

            // Deduplicate: skip entries with same effective regex pattern signature
            const patternSignature = this.getPatternSignature(config);
            if (usedPatternSignatures.has(patternSignature)) {
                continue;
            }
            usedPatternSignatures.add(patternSignature);

            const tagId = this.generateUniqueTagId(config, usedTagIds);
            const entry = this.createTagEntry(config, tagId, i);
            this.tagEntries.push(entry);
            if (entry.type === TAG_TYPE.WITH_CUSTOM_PARAMETER) {
                this.customParameterEntries.push(entry);
            }
            usedTagIds.add(tagId);
        }

        this.simpleNEntry = {
            key: 'simpleN',
            description: 'simpleN',
            tagId: simpleNId,
            requiredConsistency: this.simpleNConfig.requiredConsistency === true,
            addSpace: false,
            reservedWidth: this.simpleNConfig.reservedWidth,
            extraPromptForLlm: this.simpleNConfig.extraPromptForLlm,
            prePattern: /\n/g,
            postPattern: new RegExp(String.raw`\[b=${simpleNId}\]`, 'g'),
        };

        this.longRunEntries = longRunTagConfigs.map((config, index) => {
            let tagId = config.tagId;
            if (tagId?.length !== 2 || usedLongRunTagIds.has(tagId)) {
                tagId = this.generateUniqueTagId(
                    {
                        description: `longRun${index}`,
                    },
                    usedTagIds
                );
            }

            usedTagIds.add(tagId);
            usedLongRunTagIds.add(tagId);
            return this.createLongRunEntry(config, tagId, index);
        });

        this.spaceRunEntry = this.longRunEntries[0] || null;
    }

    validateAndNormalizeConfig(config, index) {
        const normalized = { ...config };

        if (!normalized || typeof normalized !== 'object') {
            throw new Error(`Invalid tag config at index ${index}`);
        }
        if (typeof normalized.description !== 'string' || !normalized.description) {
            throw new Error(`Tag config missing description at index ${index}`);
        }
        if (typeof normalized.tagSymbol !== 'string') {
            throw new Error(`Tag config missing tagSymbol: ${normalized.description}`);
        }
        if (typeof normalized.requiredConsistency !== 'boolean') {
            throw new Error(`Tag config missing requiredConsistency: ${normalized.description}`);
        }
        if (!Object.values(TAG_TYPE).includes(normalized.type)) {
            throw new Error(`Tag config has invalid type: ${normalized.description}`);
        }

        // Normalize style — default to ESCAPE for backward compatibility
        normalized.style = Object.values(TAG_STYLE).includes(normalized.style)
            ? normalized.style
            : TAG_STYLE.ESCAPE;

        if (normalized.type === TAG_TYPE.WITH_CUSTOM_PARAMETER) {
            if (normalized.style === TAG_STYLE.XML) {
                // XML custom-parameter tags use colon as separator; bracket defaults to NONE
                normalized.bracket = Object.values(TAG_BRACKET).includes(normalized.bracket)
                    ? normalized.bracket
                    : TAG_BRACKET.NONE;
                if (typeof normalized.maskValue !== 'boolean') {
                    normalized.maskValue = false;
                }
            } else {
                // Escape-style: bracket must be a real bracket (not NONE)
                if (
                    !Object.values(TAG_BRACKET).includes(normalized.bracket) ||
                    normalized.bracket === TAG_BRACKET.NONE
                ) {
                    throw new Error(
                        `Custom-parameter tag missing valid bracket: ${normalized.description}`
                    );
                }
                if (typeof normalized.maskValue !== 'boolean') {
                    throw new Error(
                        `Custom-parameter tag missing maskValue: ${normalized.description}`
                    );
                }
            }
        }

        normalized.addSpace = !!normalized.addSpace;
        const parsedReservedWidth = Number(normalized.reservedWidth);
        normalized.reservedWidth =
            Number.isFinite(parsedReservedWidth) && parsedReservedWidth > 0
                ? Math.floor(parsedReservedWidth)
                : 0;

        normalized.extraPromptForLlm =
            typeof normalized.extraPromptForLlm === 'string'
                ? normalized.extraPromptForLlm.trim()
                : '';

        // alwaysTranslate: only valid for non-masked withCustomParameter or withoutParameter
        // (not applicable when maskValue is true — value is not sent to LLM)
        const isMasked =
            normalized.type === TAG_TYPE.WITH_CUSTOM_PARAMETER && normalized.maskValue === true;
        normalized.alwaysTranslate = !isMasked && normalized.alwaysTranslate === true;

        // alwaysAddToKnowledgeBase: only valid for withCustomParameter (non-masked, non-numeric)
        const supportsKbase = !isMasked && normalized.type === TAG_TYPE.WITH_CUSTOM_PARAMETER;
        normalized.alwaysAddToKnowledgeBase =
            supportsKbase && normalized.alwaysAddToKnowledgeBase === true;

        return normalized;
    }

    generateUniqueTagId(config, usedTagIds) {
        const seedSource = makeTagIdSeed(config.description) || 't';
        const firstChar = seedSource[0] || 't';
        const preferredSecondChar = seedSource[1] || '0';
        const preferred = `${firstChar}${preferredSecondChar}`;

        if (!usedTagIds.has(preferred)) {
            return preferred;
        }

        for (const secondChar of ID_ALPHABET) {
            const candidate = `${firstChar}${secondChar}`;
            if (!usedTagIds.has(candidate)) {
                return candidate;
            }
        }

        for (const first of ID_ALPHABET) {
            for (const second of ID_ALPHABET) {
                const candidate = `${first}${second}`;
                if (!usedTagIds.has(candidate)) {
                    return candidate;
                }
            }
        }

        throw new Error('No available 2-char tag identifiers left');
    }

    createTagEntry(config, tagId, index) {
        const key = `${config.description}#${index}`;
        const symbol = config.tagSymbol;
        const escapedSymbol = escapeRegExp(symbol);
        const isXml = config.style === TAG_STYLE.XML;

        // ---- XML-style tags: <Symbol>, <Symbol:N>, <Symbol:value> ----

        if (isXml && config.type === TAG_TYPE.WITH_NUMERIC_PARAMETER) {
            return {
                ...config,
                key,
                tagId,
                // Matches <Symbol:123>
                prePattern: new RegExp(String.raw`<${escapedSymbol}:(\d+)>`, 'gi'),
                // Same encoded form as escape-style numeric: [b=idN]
                postPattern: new RegExp(String.raw`\[b=${tagId}(\d+)\]`, 'gi'),
            };
        }

        if (isXml && config.type === TAG_TYPE.WITHOUT_PARAMETER) {
            return {
                ...config,
                key,
                tagId,
                // Matches <Symbol>
                prePattern: new RegExp(`<${escapedSymbol}>`, 'gi'),
                // Same encoded form as escape-style no-param: [b=id]
                postPattern: new RegExp(String.raw`\[b=${tagId}\]`, 'gi'),
            };
        }

        if (isXml && config.type === TAG_TYPE.WITH_CUSTOM_PARAMETER) {
            // Original: <Symbol:value>  Encoded: [b=id<value>] (angle brackets for encoding)
            return {
                ...config,
                key,
                tagId,
                bracket: '<', // encoding bracket (for customParameterEntries / normalizeTagIdentity)
                bracketClose: '>', // encoding bracket close
                // Matches <Symbol:anything-except-> >
                prePattern: new RegExp(`<${escapedSymbol}:([^>]*)>`, 'gi'),
                postPattern: new RegExp(String.raw`\[b=${tagId}<([^>]*)>\]`, 'gi'),
            };
        }

        // ---- Escape-style tags (default / legacy): \Symbol, \Symbol[N], \Symbol<v> ----

        if (config.type === TAG_TYPE.WITH_NUMERIC_PARAMETER) {
            return {
                ...config,
                key,
                tagId,
                prePattern: new RegExp(
                    String.raw`${ESCAPE_PREFIX_PATTERN}${escapedSymbol}\[(\d+)\]`,
                    'gi'
                ),
                postPattern: new RegExp(String.raw`\[b=${tagId}(\d+)\]`, 'gi'),
            };
        }

        if (config.type === TAG_TYPE.WITHOUT_PARAMETER) {
            return {
                ...config,
                key,
                tagId,
                prePattern: new RegExp(`${ESCAPE_PREFIX_PATTERN}${escapedSymbol}`, 'gi'),
                postPattern: new RegExp(String.raw`\[b=${tagId}\]`, 'gi'),
            };
        }

        if (config.type === TAG_TYPE.WITH_CUSTOM_PARAMETER) {
            const open = config.bracket;
            const close = BRACKET_CLOSE_BY_OPEN[open];
            const escapedOpen = escapeRegExp(open);
            const escapedClose = escapeRegExp(close);
            const valueCapture = `([^${escapedClose}]*)`;
            return {
                ...config,
                key,
                tagId,
                bracketClose: close,
                prePattern: new RegExp(
                    `${ESCAPE_PREFIX_PATTERN}${escapedSymbol}${escapedOpen}${valueCapture}${escapedClose}`,
                    'gi'
                ),
                postPattern: new RegExp(
                    String.raw`\[b=${tagId}${escapedOpen}${valueCapture}${escapedClose}\]`,
                    'gi'
                ),
            };
        }

        // Legacy TAG_TYPE.XML — kept for backward compatibility; use style: TAG_STYLE.XML instead
        if (config.type === TAG_TYPE.XML) {
            return {
                ...config,
                key,
                tagId,
                prePattern: new RegExp(`<${escapedSymbol}>`, 'gi'),
                postPattern: new RegExp(`\\[b=${tagId}\\]`, 'gi'),
            };
        }

        throw new Error(`Unsupported tag type: ${config.description}`);
    }

    preprocessTags(text) {
        if (typeof text !== 'string') {
            return { preprocessedText: text, tagCounts: {}, caseMap: {} };
        }

        let result = text;
        const tagCounts = {};
        const caseMap = {
            maskedByTagKey: {},
            expectedMaskedIdsByTagKey: {},
            hasLiteralClosingBTag: text.includes('[/b]'),
        };

        for (const entry of this.tagEntries) {
            const matches = result.match(entry.prePattern) || [];
            tagCounts[entry.key] = matches.length;

            if (entry.type === TAG_TYPE.WITH_NUMERIC_PARAMETER) {
                result = result.replace(entry.prePattern, (_, param) => {
                    return `[b=${entry.tagId}${param}]`;
                });
                continue;
            }

            if (entry.type === TAG_TYPE.WITHOUT_PARAMETER) {
                result = result.replace(entry.prePattern, () => {
                    return `[b=${entry.tagId}]`;
                });
                continue;
            }

            if (entry.type === TAG_TYPE.WITH_CUSTOM_PARAMETER) {
                const maskedValues = [];
                let replacementResult;

                if (entry.style === TAG_STYLE.XML) {
                    replacementResult = {
                        count: (result.match(entry.prePattern) || []).length,
                        text: result.replace(entry.prePattern, (_, paramValue) => {
                            if (!entry.maskValue) {
                                return `[b=${entry.tagId}${entry.bracket}${paramValue}${entry.bracketClose}]`;
                            }

                            const nextMaskId = maskedValues.length;
                            maskedValues.push(paramValue);
                            return `[b=${entry.tagId}${entry.bracket}${nextMaskId}${entry.bracketClose}]`;
                        }),
                    };
                } else {
                    replacementResult = this.replaceEscapeStyleCustomTags(
                        result,
                        entry,
                        (paramValue) => {
                            if (!entry.maskValue) {
                                return `[b=${entry.tagId}${entry.bracket}${paramValue}${entry.bracketClose}]`;
                            }

                            const nextMaskId = maskedValues.length;
                            maskedValues.push(paramValue);
                            return `[b=${entry.tagId}${entry.bracket}${nextMaskId}${entry.bracketClose}]`;
                        }
                    );
                }

                result = replacementResult.text;
                tagCounts[entry.key] = replacementResult.count;

                if (entry.maskValue) {
                    caseMap.maskedByTagKey[entry.key] = maskedValues;
                    caseMap.expectedMaskedIdsByTagKey[entry.key] = maskedValues.map(
                        (_, idx) => idx
                    );
                }
                continue;
            }

            if (entry.type === TAG_TYPE.XML) {
                result = result.replace(entry.prePattern, () => `[b=${entry.tagId}]`);
            }
        }

        const newlineMatches = result.match(this.simpleNEntry.prePattern) || [];
        tagCounts[this.simpleNEntry.key] = newlineMatches.length;
        result = result.replace(this.simpleNEntry.prePattern, `[b=${this.simpleNEntry.tagId}]`);

        caseMap.expectedLongRunLengthsByTagKey = {};
        for (const entry of this.longRunEntries) {
            const expectedRunLengths = [];
            const runMatches = result.match(entry.prePattern) || [];
            tagCounts[entry.key] = runMatches.length;
            result = result.replace(entry.prePattern, (run) => {
                expectedRunLengths.push(run.length);
                return `[b=${entry.tagId}${run.length}]`;
            });
            caseMap.expectedLongRunLengthsByTagKey[entry.key] = expectedRunLengths;
        }

        return { preprocessedText: result, tagCounts, caseMap };
    }

    postprocessTags(text, tagCounts, caseMap) {
        if (typeof text !== 'string') {
            return {
                text,
                valid: false,
                errorReason: 'Value is not a string',
                expectedCounts: tagCounts,
                actualCounts: {},
            };
        }

        const strictResult = this.postprocessTagsOnce(text, tagCounts, caseMap, {
            allowLooseXmlCustomTagClosing: false,
            suppressUnresolvedWarning: true,
        });

        if (
            strictResult.valid ||
            strictResult.errorReason !== 'Unresolved escaped tags left in output ([b=...)'
        ) {
            return strictResult;
        }

        const fallbackXmlTagIds = new Set();
        const strictText = strictResult.text;
        for (const entry of this.customParameterEntries) {
            if (entry.style !== TAG_STYLE.XML) {
                continue;
            }

            const tokenPrefix = `[b=${entry.tagId}${entry.bracket}`.toLowerCase();
            const expectedCount = Number(tagCounts?.[entry.key] || 0);
            if (
                expectedCount > 0 ||
                String(strictText || '')
                    .toLowerCase()
                    .includes(tokenPrefix)
            ) {
                fallbackXmlTagIds.add(entry.tagId);
            }
        }

        if (fallbackXmlTagIds.size === 0) {
            return strictResult;
        }

        return this.postprocessTagsOnce(text, tagCounts, caseMap, {
            allowLooseXmlCustomTagClosing: true,
            suppressUnresolvedWarning: false,
            onlyLooseXmlTagIds: fallbackXmlTagIds,
            skipMalformedRangeProtection: true,
        });
    }

    postprocessTagsOnce(text, tagCounts, caseMap, options = {}) {
        let result = text;
        const actualCounts = {};
        const usedMaskedIdsByTagKey = {};
        const maskedByTagKey = caseMap?.maskedByTagKey || {};
        const allowLooseXmlCustomTagClosing = options?.allowLooseXmlCustomTagClosing === true;
        const suppressUnresolvedWarning = options?.suppressUnresolvedWarning === true;
        const onlyLooseXmlTagIds = options?.onlyLooseXmlTagIds || null;
        const skipMalformedRangeProtection = options?.skipMalformedRangeProtection === true;
        const processingEntries = [
            ...this.tagEntries.filter((entry) => entry.type === TAG_TYPE.WITH_CUSTOM_PARAMETER),
            ...this.tagEntries.filter((entry) => entry.type !== TAG_TYPE.WITH_CUSTOM_PARAMETER),
        ];
        if (!skipMalformedRangeProtection) {
            const malformedCustomRanges = this.findMalformedEncodedCustomTagRanges(result, {
                allowLooseXmlCustomTagClosing,
            });
            result = this.protectEncodedTagsInRanges(
                result,
                malformedCustomRanges,
                PROTECTED_B_TAG_PREFIX
            );
        }

        for (const entry of processingEntries) {
            if (entry.type === TAG_TYPE.WITH_NUMERIC_PARAMETER) {
                const matches = result.match(entry.postPattern) || [];
                actualCounts[entry.key] = matches.length;
                result = result.replace(entry.postPattern, (_, param) => {
                    if (entry.style === TAG_STYLE.XML) {
                        return `<${entry.tagSymbol}:${param}>`;
                    }
                    return `\\${entry.tagSymbol}[${param}]`;
                });
                continue;
            }

            if (entry.type === TAG_TYPE.WITHOUT_PARAMETER) {
                const matches = result.match(entry.postPattern) || [];
                actualCounts[entry.key] = matches.length;
                result = result.replace(entry.postPattern, () => {
                    if (entry.style === TAG_STYLE.XML) {
                        return `<${entry.tagSymbol}>`;
                    }
                    const replacement = `\\${entry.tagSymbol}`;
                    return entry.addSpace ? `${replacement} ` : replacement;
                });
                continue;
            }

            if (entry.type === TAG_TYPE.WITH_CUSTOM_PARAMETER) {
                if (
                    onlyLooseXmlTagIds &&
                    entry.style === TAG_STYLE.XML &&
                    !onlyLooseXmlTagIds.has(entry.tagId)
                ) {
                    actualCounts[entry.key] = 0;
                    continue;
                }

                const replacementResult = this.replaceEncodedCustomTags(
                    result,
                    entry,
                    (paramValue) => {
                        let resolvedValue = paramValue;

                        if (entry.maskValue) {
                            const maskedValues = maskedByTagKey[entry.key] || [];
                            const maskId = Number(paramValue);
                            if (!usedMaskedIdsByTagKey[entry.key]) {
                                usedMaskedIdsByTagKey[entry.key] = new Set();
                            }
                            if (Number.isFinite(maskId)) {
                                usedMaskedIdsByTagKey[entry.key].add(maskId);
                            }
                            resolvedValue =
                                Number.isFinite(maskId) && maskedValues[maskId] !== undefined
                                    ? maskedValues[maskId]
                                    : paramValue;
                        }

                        if (entry.style === TAG_STYLE.XML) {
                            return `<${entry.tagSymbol}:${resolvedValue}>`;
                        }
                        return `\\${entry.tagSymbol}${entry.bracket}${resolvedValue}${entry.bracketClose}`;
                    },
                    {
                        allowLooseXmlCustomTagClosing,
                    }
                );
                result = replacementResult.text;
                actualCounts[entry.key] = replacementResult.count;
                continue;
            }

            // Legacy TAG_TYPE.XML — always restores as <symbol>
            if (entry.type === TAG_TYPE.XML) {
                const matches = result.match(entry.postPattern) || [];
                actualCounts[entry.key] = matches.length;
                result = result.replace(entry.postPattern, () => `<${entry.tagSymbol}>`);
            }
        }

        // LLMs sometimes insert raw line wraps inside escape-command chains
        // (e.g. "\\AA[FFF]\n\\FH[OFF]"). Remove only those literal wraps;
        // intended newlines are still encoded as [b=..] at this stage.
        result = this.repairLiteralLineWrapsAroundEscapeTags(result);

        // Keep only newlines that were explicitly preserved as safe tags.
        // Any literal line breaks returned by the LLM are removed before unpacking.
        result = result.replace(/\r?\n/g, '');

        const simpleNMatches = result.match(this.simpleNEntry.postPattern) || [];
        actualCounts[this.simpleNEntry.key] = simpleNMatches.length;
        result = result.replace(this.simpleNEntry.postPattern, () => '\n');

        const expectedLongRunLengthsByTagKey = caseMap?.expectedLongRunLengthsByTagKey || {};
        const actualLongRunLengthsByTagKey = {};
        for (const entry of this.longRunEntries) {
            const actualRunLengths = [];
            const runMatches = result.match(entry.postPattern) || [];
            actualCounts[entry.key] = runMatches.length;
            result = result.replace(entry.postPattern, (match, runLengthText) => {
                const runLength = Number(runLengthText);
                actualRunLengths.push(runLength);

                if (!Number.isSafeInteger(runLength) || runLength < 0) {
                    return match;
                }

                return entry.character.repeat(runLength);
            });
            actualLongRunLengthsByTagKey[entry.key] = actualRunLengths;
        }

        const originalHadClosingBTag = !!caseMap?.hasLiteralClosingBTag;
        result = this.restoreProtectedEncodedTags(result, PROTECTED_B_TAG_PREFIX);
        if (!originalHadClosingBTag && /\[\/b\]/i.test(result)) {
            result = result.replace(/\[\/b\]/gi, '');
        }

        let hasUnresolvedEscapedTag = /\[b=/i.test(result);
        if (hasUnresolvedEscapedTag && onlyLooseXmlTagIds instanceof Set) {
            hasUnresolvedEscapedTag = false;
            for (const entry of this.customParameterEntries) {
                if (entry.style !== TAG_STYLE.XML || !onlyLooseXmlTagIds.has(entry.tagId)) {
                    continue;
                }

                const tokenPrefix = `[b=${entry.tagId}${entry.bracket}`.toLowerCase();
                if (result.toLowerCase().includes(tokenPrefix)) {
                    hasUnresolvedEscapedTag = true;
                    break;
                }
            }
        }
        if (hasUnresolvedEscapedTag) {
            if (!suppressUnresolvedWarning) {
                console.warn(
                    '[TagManager] Unresolved escaped tags found in postprocessed text:',
                    result
                );
            }
            return {
                text: result,
                valid: false,
                errorReason: 'Unresolved escaped tags left in output ([b=...)',
                expectedCounts: tagCounts,
                actualCounts,
            };
        }

        let valid = this.areAllTagsWithRequiredConsistencyValid(tagCounts, actualCounts);

        const expectedMaskedIdsByTagKey = caseMap?.expectedMaskedIdsByTagKey || {};
        const maskedIdsValid = Object.keys(expectedMaskedIdsByTagKey).every((key) => {
            const expected = expectedMaskedIdsByTagKey[key] || [];
            const seenSet = usedMaskedIdsByTagKey[key] || new Set();
            if (expected.length !== seenSet.size) {
                return false;
            }
            return expected.every((maskId) => seenSet.has(maskId));
        });

        if (!maskedIdsValid) {
            valid = false;
        }

        const longRunsValid = this.longRunEntries.every((entry) => {
            const expectedRuns = expectedLongRunLengthsByTagKey[entry.key] || [];
            const actualRuns = actualLongRunLengthsByTagKey[entry.key] || [];
            return (
                expectedRuns.length === actualRuns.length &&
                expectedRuns.every((length, index) => actualRuns[index] === length)
            );
        });

        if (!longRunsValid) {
            valid = false;
        }

        if (!valid) {
            const differences = {};
            const allKeys = new Set([
                ...Object.keys(tagCounts || {}),
                ...Object.keys(actualCounts || {}),
            ]);

            for (const key of allKeys) {
                const expected = Number(tagCounts?.[key] || 0);
                const got = Number(actualCounts?.[key] || 0);
                if (expected === got) {
                    continue;
                }

                differences[key] = {
                    expected,
                    got,
                };
            }

            console.warn('[TagManager] Tag count mismatch:', {
                differences,
                expectedLongRunLengthsByTagKey,
                actualLongRunLengthsByTagKey,
            });
        }

        return {
            text: result,
            valid,
            errorReason: 'Tag count mismatch',
            expectedCounts: tagCounts,
            actualCounts,
        };
    }

    areAllTagsWithRequiredConsistencyValid(expectedCounts, actualCounts) {
        const requiredTypes = this.tagEntries
            .filter((entry) => entry.requiredConsistency)
            .map((entry) => entry.key);

        return requiredTypes.every(
            (typeKey) => actualCounts[typeKey] === (expectedCounts[typeKey] || 0)
        );
    }

    /**
     * Validate that no unknown [b=...] tags were hallucinated
     * @param {string} rawText - Original text with escape codes
     * @param {Object} originalPreprocessed - Original preprocessed result
     * @returns {Object} {valid, unknownTags[]}
     */
    validateUnknownTags(rawText, originalPreprocessed) {
        if (typeof rawText !== 'string') {
            return { valid: true, unknownTags: [] };
        }

        const originalTagPattern = /\[b=([^\]]+)\]/g;
        const originalTags = new Set();
        let match;
        while ((match = originalTagPattern.exec(originalPreprocessed.preprocessedText)) !== null) {
            originalTags.add(this.normalizeTagIdentity(match[1]));
        }

        const unknownTags = [];
        const currentTagPattern = /\[b=([^\]]+)\]/g;
        while ((match = currentTagPattern.exec(rawText)) !== null) {
            const tag = match[1];
            if (!originalTags.has(this.normalizeTagIdentity(tag))) {
                unknownTags.push(tag);
            }
        }

        return {
            valid: unknownTags.length === 0,
            unknownTags,
        };
    }

    normalizeTagIdentity(tag) {
        if (typeof tag !== 'string') {
            return tag;
        }

        for (const entry of this.customParameterEntries) {
            const open = entry.bracket;
            const close = entry.bracketClose;
            const prefix = `${entry.tagId}${open}`;
            if (tag.startsWith(prefix) && tag.endsWith(close)) {
                return `${entry.tagId}${open}${close}`;
            }
        }

        return tag;
    }

    replaceEncodedCustomTags(text, entry, replacementFactory, options = {}) {
        if (typeof text !== 'string') {
            return { text, count: 0 };
        }

        const tokenPrefix = `[b=${entry.tagId}${entry.bracket}`.toLowerCase();
        const source = text;
        const sourceLower = source.toLowerCase();
        const open = entry.bracket;
        const close = entry.bracketClose;
        const allowLooseXmlCustomTagClosing = options?.allowLooseXmlCustomTagClosing === true;
        let cursor = 0;
        let count = 0;
        let output = '';

        while (cursor < source.length) {
            const tokenStart = sourceLower.indexOf(tokenPrefix, cursor);
            if (tokenStart === -1) {
                output += source.slice(cursor);
                break;
            }

            output += source.slice(cursor, tokenStart);
            const openIndex = tokenStart + tokenPrefix.length - 1;
            const balanced = this.readBalancedValue(source, openIndex, open, close);
            const hasStrictClosing = balanced && source[balanced.closeIndex + 1] === ']';
            const hasLooseXmlClosing =
                allowLooseXmlCustomTagClosing &&
                entry.style === TAG_STYLE.XML &&
                balanced &&
                !hasStrictClosing;

            if (!balanced || (!hasStrictClosing && !hasLooseXmlClosing)) {
                // Leave malformed/mismatched token untouched and continue scanning.
                output += source[tokenStart];
                cursor = tokenStart + 1;
                continue;
            }

            output += replacementFactory(balanced.value);
            cursor = balanced.closeIndex + (hasStrictClosing ? 2 : 1);
            count += 1;
        }

        return { text: output, count };
    }

    replaceEscapeStyleCustomTags(text, entry, replacementFactory) {
        if (typeof text !== 'string') {
            return { text, count: 0 };
        }

        const open = entry.bracket;
        const close = entry.bracketClose;
        const escapedSymbol = escapeRegExp(entry.tagSymbol);
        const escapedOpen = escapeRegExp(open);
        const pattern = new RegExp(`${ESCAPE_PREFIX_PATTERN}${escapedSymbol}${escapedOpen}`, 'gi');
        const source = text;
        let cursor = 0;
        let count = 0;
        let output = '';
        let match;

        pattern.lastIndex = 0;
        while ((match = pattern.exec(source)) !== null) {
            const tokenStart = match.index;
            const openIndex = tokenStart + match[0].length - 1;
            const balanced = this.readBalancedValue(source, openIndex, open, close);

            if (!balanced) {
                continue;
            }

            output += source.slice(cursor, tokenStart);
            output += replacementFactory(balanced.value);
            cursor = balanced.closeIndex + 1;
            count += 1;
            pattern.lastIndex = cursor;
        }

        output += source.slice(cursor);
        return { text: output, count };
    }

    findMalformedEncodedCustomTagRanges(text, options = {}) {
        if (typeof text !== 'string' || text.length === 0) {
            return [];
        }

        const ranges = [];
        const entries = this.customParameterEntries;
        const allowLooseXmlCustomTagClosing = options?.allowLooseXmlCustomTagClosing === true;

        for (const entry of entries) {
            const tokenPrefix = `[b=${entry.tagId}${entry.bracket}`.toLowerCase();
            const source = text;
            const sourceLower = source.toLowerCase();
            const open = entry.bracket;
            const close = entry.bracketClose;
            let cursor = 0;

            while (cursor < source.length) {
                const tokenStart = sourceLower.indexOf(tokenPrefix, cursor);
                if (tokenStart === -1) {
                    break;
                }

                const openIndex = tokenStart + tokenPrefix.length - 1;
                const balanced = this.readBalancedValue(source, openIndex, open, close);
                const hasStrictClosing = balanced && source[balanced.closeIndex + 1] === ']';
                const hasLooseXmlClosing =
                    allowLooseXmlCustomTagClosing &&
                    entry.style === TAG_STYLE.XML &&
                    balanced &&
                    !hasStrictClosing;

                if (!balanced) {
                    cursor = tokenStart + 1;
                    continue;
                }

                if (!hasStrictClosing && !hasLooseXmlClosing) {
                    ranges.push({
                        start: tokenStart,
                        end: balanced.closeIndex + 1,
                    });
                    cursor = balanced.closeIndex + 1;
                    continue;
                }

                cursor = balanced.closeIndex + (hasStrictClosing ? 2 : 1);
            }
        }

        return this.mergeOverlappingRanges(ranges);
    }

    mergeOverlappingRanges(ranges) {
        if (!Array.isArray(ranges) || ranges.length === 0) {
            return [];
        }

        const sorted = [...ranges].sort((a, b) => a.start - b.start);
        const merged = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const last = merged[merged.length - 1];
            if (current.start <= last.end) {
                last.end = Math.max(last.end, current.end);
            } else {
                merged.push({ ...current });
            }
        }

        return merged;
    }

    protectEncodedTagsInRanges(text, ranges, marker) {
        if (typeof text !== 'string' || !Array.isArray(ranges) || ranges.length === 0) {
            return text;
        }

        let output = '';
        let cursor = 0;

        for (const range of ranges) {
            output += text.slice(cursor, range.start);
            const segment = text.slice(range.start, range.end);
            output += segment.replace(/\[b=/gi, `[${marker}=`);
            cursor = range.end;
        }

        output += text.slice(cursor);
        return output;
    }

    restoreProtectedEncodedTags(text, marker) {
        if (typeof text !== 'string') {
            return text;
        }

        const restorePattern = new RegExp(String.raw`\[${escapeRegExp(marker)}=`, 'gi');
        return text.replace(restorePattern, '[b=');
    }

    replaceRawCustomTags(text, entry, replacementFactory) {
        if (typeof text !== 'string') {
            return { text, count: 0 };
        }

        const source = text;
        const sourceLower = source.toLowerCase();
        const symbol = String(entry.tagSymbol || '');
        const symbolLower = symbol.toLowerCase();
        const symbolLength = symbol.length;
        const open = entry.bracket;
        const close = entry.bracketClose;
        let cursor = 0;
        let count = 0;
        let output = '';

        if (!symbolLength) {
            return { text, count };
        }

        while (cursor < source.length) {
            let tokenStart = -1;
            let openIndex = -1;

            for (let i = cursor; i < source.length; i++) {
                const prefix = source[i];
                if (prefix !== '\\' && prefix !== '\u001b') {
                    continue;
                }

                const symbolStart = i + 1;
                const symbolEnd = symbolStart + symbolLength;
                if (sourceLower.slice(symbolStart, symbolEnd) !== symbolLower) {
                    continue;
                }

                if (source[symbolEnd] !== open) {
                    continue;
                }

                tokenStart = i;
                openIndex = symbolEnd;
                break;
            }

            if (tokenStart === -1) {
                output += source.slice(cursor);
                break;
            }

            output += source.slice(cursor, tokenStart);
            const balanced = this.readBalancedValue(source, openIndex, open, close);

            if (!balanced) {
                // Keep malformed token as-is and continue from the next character.
                output += source[tokenStart];
                cursor = tokenStart + 1;
                continue;
            }

            output += replacementFactory(balanced.value);
            cursor = balanced.closeIndex + 1;
            count += 1;
        }

        return { text: output, count };
    }

    repairLiteralLineWrapsAroundEscapeTags(text) {
        if (typeof text !== 'string' || text.length === 0) {
            return text;
        }

        // Case 1: line wrap between commands, e.g. "... ]\n\\FH[...]"
        const newlineBeforeEscapeCommand = new RegExp(
            String.raw`\r?\n(?=\\[${ESCAPE_TAG_SYMBOL_START_CLASS}])`,
            'g'
        );
        let repaired = text.replace(newlineBeforeEscapeCommand, '');

        // Case 2: line wrap after backslash, e.g. "\\\nFH[...]"
        const newlineAfterEscapeSlash = new RegExp(
            String.raw`\\\r?\n(?=[${ESCAPE_TAG_SYMBOL_START_CLASS}])`,
            'g'
        );
        repaired = repaired.replace(newlineAfterEscapeSlash, '\\');

        return repaired;
    }

    readBalancedValue(text, openIndex, open, close) {
        if (text[openIndex] !== open) {
            return null;
        }

        let depth = 0;
        for (let i = openIndex + 1; i < text.length; i++) {
            const current = text[i];
            if (current === open) {
                depth += 1;
                continue;
            }
            if (current === close) {
                if (depth === 0) {
                    return {
                        value: text.slice(openIndex + 1, i),
                        closeIndex: i,
                    };
                }
                depth -= 1;
            }
        }

        return null;
    }

    /**
     * Get all tag entries whose `alwaysTranslate` flag is set and whose encoded pattern
     * appears in at least one of the provided preprocessed texts.
     * Returns an array of `b=tagId` strings for use in the LLM prompt.
     * @param {string[]} preprocessedTexts
     * @returns {string[]}
     */
    getAlwaysTranslateTagIds(preprocessedTexts) {
        const texts = Array.isArray(preprocessedTexts) ? preprocessedTexts : [];
        const result = [];
        for (const entry of this.tagEntries) {
            if (!entry.alwaysTranslate) {
                continue;
            }
            const needle = `[b=${entry.tagId}`;
            if (texts.some((t) => typeof t === 'string' && t.includes(needle))) {
                result.push(`b=${entry.tagId}`);
            }
        }
        return result;
    }

    /**
     * Get all tag entries whose `alwaysAddToKnowledgeBase` flag is set and whose encoded
     * pattern appears in at least one of the provided preprocessed texts.
     * Returns an array of `b=tagId` strings for use in the LLM prompt.
     * @param {string[]} preprocessedTexts
     * @returns {string[]}
     */
    getAlwaysAddToKnowledgeBaseTagIds(preprocessedTexts) {
        const texts = Array.isArray(preprocessedTexts) ? preprocessedTexts : [];
        const result = [];
        for (const entry of this.tagEntries) {
            if (!entry.alwaysAddToKnowledgeBase) {
                continue;
            }
            const needle = `[b=${entry.tagId}`;
            if (texts.some((t) => typeof t === 'string' && t.includes(needle))) {
                result.push(`b=${entry.tagId}`);
            }
        }
        return result;
    }

    /**
     * Collect additional prompt entries for tags that are present in preprocessed texts.
     * Returns values formatted as "b=tagId - extraPromptText".
     * @param {string[]} preprocessedTexts
     * @returns {string[]}
     */
    getAdditionalTagPromptInfos(preprocessedTexts) {
        const texts = Array.isArray(preprocessedTexts) ? preprocessedTexts : [];
        const result = [];

        for (const entry of this.tagEntries) {
            const extraPrompt =
                typeof entry.extraPromptForLlm === 'string' ? entry.extraPromptForLlm.trim() : '';
            if (!extraPrompt) {
                continue;
            }

            const needle = `[b=${entry.tagId}`;
            if (!texts.some((t) => typeof t === 'string' && t.includes(needle))) {
                continue;
            }

            const compactPrompt = extraPrompt.replace(/\s+/g, ' ').trim();
            result.push(`b=${entry.tagId} - ${compactPrompt}`);
        }

        const newlinePrompt =
            typeof this.simpleNEntry?.extraPromptForLlm === 'string'
                ? this.simpleNEntry.extraPromptForLlm.trim()
                : '';
        if (
            newlinePrompt &&
            texts.some((t) => typeof t === 'string' && t.includes(`[b=${this.simpleNEntry.tagId}]`))
        ) {
            const compactPrompt = newlinePrompt.replace(/\s+/g, ' ').trim();
            result.push(`b=${this.simpleNEntry.tagId} - ${compactPrompt}`);
        }

        return result;
    }

    /**
     * Build hint string with official character name translations from cache.
     * Returns all actor_name entries that have a non-empty translation, formatted
     * as "original: translated, ..." for use in the AI prompt.
     * @returns {string}
     */
    buildNameHints() {
        if (!this.runtime) {
            return '';
        }

        const sourceLang = this.runtime.sourceLang || 'ja';
        const targetLang = this.runtime.targetLang || 'en';
        const pairKey = `${sourceLang}-${targetLang}`;
        const prefix = `actor_name:${sourceLang}-${targetLang}-`;
        const pairProfiles = this.runtime.nameProfilesByLangPair?.[pairKey] || {};

        const { cache } = ensureTranslateCacheRuntime();
        if (!(cache instanceof Map)) {
            return '';
        }

        const hints = [];
        for (const [key, value] of cache.entries()) {
            if (!key.startsWith(prefix)) continue;
            if (!value?.trim()) continue;
            const originalName = key.slice(prefix.length);
            if (originalName) {
                const profile = pairProfiles[originalName] || {};
                const gender = profile && typeof profile.gender === 'string' ? profile.gender : '';
                const genderSuffix = gender === 'male' || gender === 'female' ? ` (${gender})` : '';
                hints.push(`${originalName}: ${value}${genderSuffix}`);
            }
        }

        return hints.join(', ');
    }
}
