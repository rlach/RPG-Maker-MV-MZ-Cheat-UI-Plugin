/**
 * ValidationService
 * Quality validation of AI responses
 * Checks shape, language, and prevents hallucinations
 */

import { StreamJsonParser } from './StreamJsonParser.js';

export class ValidationService {
    constructor(aiEngine) {
        this.aiEngine = aiEngine; // Reference to AIEngine for requestChatCompletion
    }

    normalizeTranslatedMapKeys(translatedMap) {
        if (!translatedMap || typeof translatedMap !== 'object') {
            return translatedMap;
        }

        const normalized = {};
        for (const [rawKey, value] of Object.entries(translatedMap)) {
            const key = typeof rawKey === 'string' ? rawKey.trim() : rawKey;
            if (typeof key !== 'string' || key === '') {
                continue;
            }
            if (!(key in normalized)) {
                normalized[key] = value;
            }
        }

        return normalized;
    }

    /**
     * Validate that translated map has expected shape
     * @param {Object} translatedMap - Parsed JSON response
     * @param {Array} itemData - Original items to validate against
     * @returns {Object} {valid, errors[]}
     */
    validateTranslatedMapShape(translatedMap, itemData) {
        const errors = [];
        const missingKeys = [];
        const nonStringKeys = [];

        if (!translatedMap || typeof translatedMap !== 'object') {
            errors.push('Response is not a JSON object');
            return { valid: false, errors, missingKeys, nonStringKeys };
        }

        const normalizedMap = this.normalizeTranslatedMapKeys(translatedMap);

        // Check that all expected keys are present
        for (const item of itemData) {
            const key = item.jsonKey || item.id;
            if (!(key in normalizedMap)) {
                errors.push(`Missing key: ${key}`);
                missingKeys.push(key);
            } else if (typeof normalizedMap[key] !== 'string') {
                errors.push(`Key "${key}" is not a string`);
                nonStringKeys.push(key);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            missingKeys,
            nonStringKeys,
            normalizedMap,
        };
    }

    /**
     * Validate that response is actually translated to target language
     * Optional: asks AI to confirm if enabled
     * @param {string} validationText - Text to validate
     * @param {string} targetLangName - Target language name
     * @param {string} sourceLangName - Source language name
     * @param {boolean} isBackgroundJob - Background request flag
     * @returns {Promise<Object>} {isTranslated, confidence}
     */
    async validateResponseLanguage(
        validationText,
        targetLangName,
        sourceLangName,
        isBackgroundJob = false
    ) {
        // Check if AIEngine has this validation enabled
        if (!this.aiEngine || !this.aiEngine.askAiIfTextTranslated) {
            // Default: assume translated if not checking
            return { isTranslated: true, confidence: 0.5 };
        }

        try {
            const payload = {
                messages: [
                    {
                        role: 'user',
                        content: `Is this text translated to ${targetLangName}? Or is it still mostly ${sourceLangName}? Answer only with "yes" or "no".\n\n${validationText}`,
                    },
                ],
            };

            const result = await this.aiEngine.requestChatCompletion(payload, {
                isBackgroundJob,
            });
            const text = result?.text?.toLowerCase() || '';

            const isTranslated = text.includes('yes');
            return { isTranslated, confidence: 0.8 };
        } catch (e) {
            console.warn('[ValidationService] Language validation error:', e.message);
            return { isTranslated: true, confidence: 0 }; // Fail open
        }
    }

    /**
     * Validate that no unknown [b=...] tags were hallucinated
     * @param {string} rawText - Final response text
     * @param {Object} originalPreprocessed - Original preprocessing result
     * @returns {Object} {valid, hallucinations[]}
     */
    validateNoHallucinations(rawText, originalPreprocessed) {
        if (typeof rawText !== 'string' || !originalPreprocessed) {
            return { valid: true, hallucinations: [] };
        }

        // Extract all [b=...] tags from original preprocessed text
        const originalTags = new Set();
        const originalPattern = /\[b=([^\]]+)\]/g;
        let match;

        while ((match = originalPattern.exec(originalPreprocessed.preprocessedText)) !== null) {
            originalTags.add(match[1]);
        }

        // Find any [b=...] tags in final text that weren't in original
        const hallucinations = [];
        const currentPattern = /\[b=([^\]]+)\]/g;
        while ((match = currentPattern.exec(rawText)) !== null) {
            const tag = match[1];
            if (!originalTags.has(tag)) {
                hallucinations.push(tag);
            }
        }

        return {
            valid: hallucinations.length === 0,
            hallucinations,
        };
    }

    /**
     * Build validation text from translated map for language check
     * Concatenates values for spotcheck
     * @param {Object} translatedMap - JSON map
     * @param {Array} itemData - Original items
     * @returns {string}
     */
    buildValidationTextFromMap(translatedMap, itemData) {
        const normalizedMap = this.normalizeTranslatedMapKeys(translatedMap);
        const samples = [];

        for (const item of itemData.slice(0, 5)) {
            const key = item.jsonKey || item.id;
            if (key in normalizedMap && typeof normalizedMap[key] === 'string') {
                samples.push(normalizedMap[key]);
            }
        }

        return samples.join(' ');
    }
}
