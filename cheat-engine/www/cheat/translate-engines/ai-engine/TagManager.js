/**
 * TagManager
 * Game script tag escaping/unescaping
 * Handles preprocessing \V[5] -> [b=xy5] and postprocessing [b=xy5] -> \V[5]
 */

import { TAG_BRACKET, TAG_CONFIGS, TAG_STYLE, TAG_TYPE } from './constants.js';

const BRACKET_CLOSE_BY_OPEN = Object.freeze({
    [TAG_BRACKET.ANGLE]: '>',
    [TAG_BRACKET.SQUARE]: ']',
    [TAG_BRACKET.ROUND]: ')',
    [TAG_BRACKET.CURLY]: '}',
});

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ESCAPE_PREFIX_PATTERN = '(?:\\\\|\\u001b)';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const makeTagIdSeed = (value) =>
    String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

const cloneTagConfig = (config) => ({ ...config });

export class TagManager {
    constructor(panel) {
        this.panel = panel;
        this.allowNewlineMismatch = false;
        this.customTagConfigs = [];
        this.initializeTagRegistry();
    }

    setCustomTagConfigs(customTagConfigs = []) {
        this.customTagConfigs = Array.isArray(customTagConfigs)
            ? customTagConfigs.map(cloneTagConfig)
            : [];
        this.initializeTagRegistry();
    }

    initializeTagRegistry() {
        const configs = [...TAG_CONFIGS, ...this.customTagConfigs];
        const usedTagIds = new Set();
        this.tagEntries = [];
        this.customParameterEntries = [];

        for (let i = 0; i < configs.length; i++) {
            const config = this.validateAndNormalizeConfig(configs[i], i);
            const tagId = this.generateUniqueTagId(config, usedTagIds);
            const entry = this.createTagEntry(config, tagId, i);
            this.tagEntries.push(entry);
            if (entry.type === TAG_TYPE.WITH_CUSTOM_PARAMETER) {
                this.customParameterEntries.push(entry);
            }
            usedTagIds.add(tagId);
        }

        const simpleNId = this.generateUniqueTagId(
            {
                description: 'simpleN',
            },
            usedTagIds
        );
        usedTagIds.add(simpleNId);

        this.simpleNEntry = {
            key: 'simpleN',
            description: 'simpleN',
            tagId: simpleNId,
            requiredConsistency: false,
            addSpace: false,
            prePattern: /\n/g,
            postPattern: new RegExp(`\\[b=${simpleNId}\\]`, 'g'),
        };
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
                prePattern: new RegExp(`<${escapedSymbol}:(\\d+)>`, 'gi'),
                // Same encoded form as escape-style numeric: [b=idN]
                postPattern: new RegExp(`\\[b=${tagId}(\\d+)\\]`, 'gi'),
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
                postPattern: new RegExp(`\\[b=${tagId}\\]`, 'gi'),
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
                postPattern: new RegExp(`\\[b=${tagId}<([^>]*)>\\]`, 'gi'),
            };
        }

        // ---- Escape-style tags (default / legacy): \Symbol, \Symbol[N], \Symbol<v> ----

        if (config.type === TAG_TYPE.WITH_NUMERIC_PARAMETER) {
            return {
                ...config,
                key,
                tagId,
                prePattern: new RegExp(
                    `${ESCAPE_PREFIX_PATTERN}${escapedSymbol}\\[(\\d+)\\]`,
                    'gi'
                ),
                postPattern: new RegExp(`\\[b=${tagId}(\\d+)\\]`, 'gi'),
            };
        }

        if (config.type === TAG_TYPE.WITHOUT_PARAMETER) {
            return {
                ...config,
                key,
                tagId,
                prePattern: new RegExp(`${ESCAPE_PREFIX_PATTERN}${escapedSymbol}`, 'gi'),
                postPattern: new RegExp(`\\[b=${tagId}\\]`, 'gi'),
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
                    `\\[b=${tagId}${escapedOpen}${valueCapture}${escapedClose}\\]`,
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
                result = result.replace(entry.prePattern, (_, paramValue) => {
                    if (!entry.maskValue) {
                        return `[b=${entry.tagId}${entry.bracket}${paramValue}${entry.bracketClose}]`;
                    }

                    const nextMaskId = maskedValues.length;
                    maskedValues.push(paramValue);
                    return `[b=${entry.tagId}${entry.bracket}${nextMaskId}${entry.bracketClose}]`;
                });

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

        let result = text;
        const actualCounts = {};
        const usedMaskedIdsByTagKey = {};
        const maskedByTagKey = (caseMap && caseMap.maskedByTagKey) || {};

        for (const entry of this.tagEntries) {
            const matches = result.match(entry.postPattern) || [];
            actualCounts[entry.key] = matches.length;

            if (entry.type === TAG_TYPE.WITH_NUMERIC_PARAMETER) {
                result = result.replace(entry.postPattern, (_, param) => {
                    if (entry.style === TAG_STYLE.XML) {
                        return `<${entry.tagSymbol}:${param}>`;
                    }
                    return `\\${entry.tagSymbol}[${param}]`;
                });
                continue;
            }

            if (entry.type === TAG_TYPE.WITHOUT_PARAMETER) {
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
                result = result.replace(entry.postPattern, (_, paramValue) => {
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
                });
                continue;
            }

            // Legacy TAG_TYPE.XML — always restores as <symbol>
            if (entry.type === TAG_TYPE.XML) {
                result = result.replace(entry.postPattern, () => `<${entry.tagSymbol}>`);
            }
        }

        const simpleNMatches = result.match(this.simpleNEntry.postPattern) || [];
        actualCounts[this.simpleNEntry.key] = simpleNMatches.length;
        result = result.replace(this.simpleNEntry.postPattern, () => '\n');

        const originalHadClosingBTag = !!(caseMap && caseMap.hasLiteralClosingBTag);
        if (!originalHadClosingBTag && /\[\/b\]/i.test(result)) {
            result = result.replace(/\[\/b\]/gi, '');
        }

        const hasUnresolvedEscapedTag = /\[b=/i.test(result);
        if (hasUnresolvedEscapedTag) {
            return {
                text: result,
                valid: false,
                errorReason: 'Unresolved escaped tags left in output ([b=...)',
                expectedCounts: tagCounts,
                actualCounts,
            };
        }

        let valid;
        if (this.allowNewlineMismatch) {
            const requiredTypes = this.tagEntries
                .filter((entry) => entry.requiredConsistency)
                .map((entry) => entry.key);
            valid = requiredTypes.every(
                (typeKey) => actualCounts[typeKey] === (tagCounts[typeKey] || 0)
            );
        } else {
            valid = Object.keys(tagCounts || {}).every((key) => {
                return actualCounts[key] === ((tagCounts && tagCounts[key]) || 0);
            });
        }

        const expectedMaskedIdsByTagKey = (caseMap && caseMap.expectedMaskedIdsByTagKey) || {};
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

        if (!valid) {
            console.warn('[TagManager] Tag count mismatch:', {
                expected: tagCounts,
                actual: actualCounts,
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

    /**
     * Build hint string with official character name translations from cache.
     * Returns all actor_name entries that have a non-empty translation, formatted
     * as "original: translated, ..." for use in the AI prompt.
     * @returns {string}
     */
    buildNameHints() {
        if (!this.panel) {
            return '';
        }

        const sourceLang = this.panel.sourceLang || 'ja';
        const targetLang = this.panel.targetLang || 'en';
        const pairKey = `${sourceLang}-${targetLang}`;
        const prefix = `actor_name:${sourceLang}-${targetLang}-`;
        const pairProfiles =
            (this.panel.nameProfilesByLangPair && this.panel.nameProfilesByLangPair[pairKey]) || {};

        const cache = window.__TranslateOnTheFlyCache;
        if (!(cache instanceof Map)) {
            return '';
        }

        const hints = [];
        for (const [key, value] of cache.entries()) {
            if (!key.startsWith(prefix)) continue;
            if (!value || !value.trim()) continue;
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
