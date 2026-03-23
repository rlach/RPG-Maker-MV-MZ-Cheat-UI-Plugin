/**
 * TagManager
 * Game script tag escaping/unescaping
 * Handles preprocessing \V[5] → [b=v5] and postprocessing [b=v5] → \V[5]
 */

import { TAG_CONFIGS } from './constants.js';

export class TagManager {
    constructor(panel) {
        this.panel = panel; // Reference to panel for cache access
    }

    /**
     * Preprocess text: convert escape codes to [b=tag] format
     * Also tracks tag counts and case mapping for later restoration
     * @param {string} text - Text with escape codes
     * @returns {Object} {preprocessedText, tagCounts, caseMap}
     */
    preprocessTags(text) {
        if (typeof text !== 'string') {
            return { preprocessedText: text, tagCounts: {}, caseMap: {} };
        }

        let result = text;
        const tagCounts = {};
        const caseMap = [];

        for (const config of TAG_CONFIGS) {
            const matches = result.match(config.prePattern) || [];
            tagCounts[config.type] = matches.length;

            if (config.hasParam) {
                result = result.replace(config.prePattern, (match, letter, num) => {
                    caseMap.push({ type: config.type, num, case: letter });
                    return `[b=${config.shortTag}${num}]`;
                });
            } else {
                result = result.replace(config.prePattern, (match, letter) => {
                    caseMap.push({ type: config.type, case: letter });
                    return `[b=${config.shortTag}]`;
                });
            }
        }

        return { preprocessedText: result, tagCounts, caseMap };
    }

    /**
     * Postprocess text: convert [b=tag] format back to escape codes
     * Uses tag counts and case map to restore original format
     * @param {string} text - Text with [b=tag] format
     * @param {Object} tagCounts - Tag count tracking
     * @param {Array} caseMap - Case mapping for restoration
     * @returns {Object} {text, valid, expectedCounts, actualCounts}
     */
    postprocessTags(text, tagCounts, caseMap) {
        if (typeof text !== 'string') {
            return { text, valid: false, expectedCounts: tagCounts, actualCounts: {} };
        }

        let result = text;
        const actualCounts = {};
        const caseLookup = {};

        // Build case lookup from caseMap
        if (Array.isArray(caseMap)) {
            for (const item of caseMap) {
                if (item.type === 'simpleN') {
                    if (!caseLookup[item.type]) {
                        caseLookup[item.type] = [];
                    }
                    caseLookup[item.type].push(item.case);
                } else if (item.hasOwnProperty('num')) {
                    if (!caseLookup[item.type]) {
                        caseLookup[item.type] = {};
                    }
                    caseLookup[item.type][item.num] = item.case;
                } else {
                    caseLookup[item.type] = item.case;
                }
            }
        }

        // Process configured tags
        for (const config of TAG_CONFIGS) {
            const matches = result.match(config.postPattern) || [];
            actualCounts[config.type] = matches.length;

            if (config.hasParam) {
                result = result.replace(config.postPattern, (match, num) => {
                    const caseLookupForType = caseLookup[config.type] || {};
                    const originalCase = caseLookupForType[num] || config.defaultCase;
                    return `\\${originalCase}[${num}]`;
                });
            } else {
                let replaceIndex = 0;
                result = result.replace(config.postPattern, (match) => {
                    if (config.type === 'simpleN') {
                        const replacement = '\n';
                        replaceIndex++;
                        return config.addSpace ? `${replacement} ` : replacement;
                    }

                    let originalCase = caseLookup[config.type] || config.defaultCase;
                    if (Array.isArray(originalCase)) {
                        originalCase = originalCase[replaceIndex] || originalCase[0] || config.defaultCase;
                    }
                    replaceIndex++;
                    const replacement = `\\${originalCase}`;
                    return config.addSpace ? `${replacement} ` : replacement;
                });
            }
        }

        // Validate tag counts
        let valid;
        if (this.allowNewlineMismatch !== undefined ? this.allowNewlineMismatch : false) {
            const requiredTypes = TAG_CONFIGS.filter(c => c.requiredConsistency).map(c => c.type);
            valid = requiredTypes.every(type => actualCounts[type] === (tagCounts[type] || 0));
        } else {
            valid = Object.keys(tagCounts).every(key => actualCounts[key] === (tagCounts[key] || 0));
        }

        if (!valid) {
            console.warn('[TagManager] Tag count mismatch:', {
                expected: tagCounts,
                actual: actualCounts
            });
        }

        return { text: result, valid, expectedCounts: tagCounts, actualCounts };
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

        // Extract all [b=...] tags from original preprocessed text
        const originalTagPattern = /\[b=([^\]]+)\]/g;
        const originalTags = new Set();
        let match;
        while ((match = originalTagPattern.exec(originalPreprocessed.preprocessedText)) !== null) {
            originalTags.add(match[1]);
        }

        // Any [b=...] tags in final text that weren't in original are hallucinations
        const unknownTags = [];
        const currentTagPattern = /\[b=([^\]]+)\]/g;
        while ((match = currentTagPattern.exec(rawText)) !== null) {
            const tag = match[1];
            if (!originalTags.has(tag)) {
                unknownTags.push(tag);
            }
        }

        return {
            valid: unknownTags.length === 0,
            unknownTags
        };
    }

    /**
     * Build hint string with character name translations from cache
     * @param {string} taggedText - Text with [b=...] tags
     * @returns {string}
     */
    buildNameHints(taggedText) {
        if (!this.panel || typeof taggedText !== 'string') {
            return '';
        }

        // Extract \N[id] patterns from original text and look up translations
        const namePattern = /\\(N|AN)\[(\d+)\]/g;
        const hints = [];
        let match;

        while ((match = namePattern.exec(taggedText)) !== null) {
            const id = parseInt(match[2], 10);
            if (this.panel.getCacheKey) {
                const key = this.panel.getCacheKey(`\\N[${id}]`, 'text');
                if (this.panel.setCacheValue) {
                    // This would be a lookup, but we're demonstrating the interface
                    hints.push(`actor_${id}`);
                }
            }
        }

        return hints.length > 0 ? `Names: ${hints.join(', ')}. ` : '';
    }
}
