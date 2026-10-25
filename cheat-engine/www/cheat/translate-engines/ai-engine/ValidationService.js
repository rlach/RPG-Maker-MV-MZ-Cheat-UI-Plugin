/**
 * ValidationService
 * Quality validation of AI responses
 * Checks shape, language, and prevents hallucinations
 */

import { languageValidationSchema } from './StructuredOutput.js';

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
        const unknownKeys = [];

        if (!translatedMap || typeof translatedMap !== 'object') {
            errors.push('Response is not a JSON object');
            return { valid: false, errors, missingKeys, nonStringKeys };
        }

        const normalizedMap = this.normalizeTranslatedMapKeys(translatedMap);

        const expected = new Set(itemData.map((item) => item.jsonKey || item.id));
        for (const key of Object.keys(normalizedMap)) {
            if (!expected.has(key)) {
                errors.push(`Unknown key: ${key}`);
                unknownKeys.push(key);
            }
        }

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
            unknownKeys,
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
                        content: `Is this text translated to ${targetLangName}? Or is it still mostly ${sourceLangName}? Return only compact JSON {"isTranslated":true} if translated, otherwise {"isTranslated":false}.\n\n${validationText}`,
                    },
                ],
            };

            const result = await this.aiEngine.requestChatCompletion(payload, {
                isBackgroundJob,
                responseSchema: languageValidationSchema,
                monitorJson: false,
            });
            const text = result?.text || '';
            const answer = JSON.parse(text);
            if (typeof answer.isTranslated !== 'boolean')
                throw new Error('Invalid language validation response');
            const isTranslated = answer.isTranslated;
            return { isTranslated, confidence: 0.8 };
        } catch (e) {
            console.warn('[ValidationService] Language validation error:', e.message);
            return { isTranslated: true, confidence: 0 }; // Fail open
        }
    }

    /**
     * Validate that no unknown encoded tags were hallucinated
     * @param {string} rawText - Final response text
     * @param {Object} originalPreprocessed - Original preprocessing result
     * @returns {Object} {valid, hallucinations[]}
     */
    validateNoHallucinations(rawText, originalPreprocessed) {
        if (typeof rawText !== 'string' || !originalPreprocessed) {
            return { valid: true, hallucinations: [] };
        }

        const result = this.aiEngine.tagManager.validateUnknownTags(rawText, originalPreprocessed);
        return { valid: result.valid, hallucinations: result.unknownTags };
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
