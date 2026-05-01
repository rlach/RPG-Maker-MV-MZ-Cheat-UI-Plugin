/**
 * LlmPayloadPreprocessor
 * Sanitizes LLM request payloads to prevent hallucinations
 * Guards against character repetition, excessive consecutive chars
 */

import { preprocessOutgoingMessageContent, preprocessPayloadForLlm } from './utils.js';

export class LlmPayloadPreprocessor {
    /**
     * Preprocess entire API request payload
     * Applies hallucination guards to message content
     * @param {Object} payload - LLM API request payload
     * @returns {Object} Sanitized payload
     */
    static preprocessPayload(payload) {
        return preprocessPayloadForLlm(payload);
    }

    /**
     * Preprocess individual content (string, array, or object)
     * @param {*} content - Content to process
     * @returns {*}
     */
    static processContent(content) {
        return preprocessOutgoingMessageContent(content);
    }
}
