/**
 * RetryHandler
 * Error recovery strategies for invalid LLM responses
 * Implements: resendFirstHalf, resendXTimes, askAIToFix, useJsonFixer, none
 */

import { StreamJsonParser } from './StreamJsonParser.js';

export class RetryHandler {
    constructor(aiEngine) {
        this.aiEngine = aiEngine; // Reference to AIEngine for request methods
        this.jsonFixerUrl = 'https://tools.netsysfire.de/json-fixer/api'; // External JSON fixer API
    }

    /**
     * Determine and execute appropriate error recovery strategy
     * @param {Object} options - {strategy, originalPayload, previousResponse, itemData, isBackgroundJob}
     * @returns {Promise<Object>} {ok, response?, error?}
     */
    async handleJsonError(options) {
        const {
            strategy,
            previousResponse,
            itemData,
            isBackgroundJob,
            retryState,
        } = options;

        if (!strategy || strategy === 'none') {
            return { ok: false, error: 'JSON_INVALID' };
        }

        if (strategy === 'resendFirstHalf') {
            return this.splitAndRetry(itemData, isBackgroundJob);
        }

        if (strategy === 'resendXTimes') {
            return this.resendSameBatch(itemData, isBackgroundJob, retryState);
        }

        if (strategy === 'askAIToFix') {
            return this.retryJsonRepair(previousResponse, 0, isBackgroundJob);
        }

        if (strategy === 'useJsonFixer') {
            return this.callExternalJsonFixer(previousResponse);
        }

        return { ok: false, error: 'UNKNOWN_STRATEGY' };
    }

    /**
     * Retry translation with error feedback
     * Sends message to AI saying previous attempt was wrong
     * @param {Object} payload - Original payload
     * @param {string} previousResponse - Failed response
     * @returns {Promise<Object>} {ok, response?, error?}
     */
    async retryTranslationWithError(payload, previousResponse) {
        try {
            const feedbackPayload = { ...payload };
            feedbackPayload.messages = [
                ...payload.messages,
                {
                    role: 'assistant',
                    content: previousResponse,
                },
                {
                    role: 'user',
                    content:
                        'Wrong! Try again! Make sure ALL values are valid JSON strings and the output is valid JSON.',
                },
            ];

            const result = await this.aiEngine.requestChatCompletion(feedbackPayload);
            return { ok: !!result, response: result };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    /**
     * Ask AI to fix malformed JSON
     * Recursive retry up to max depth
     * @param {string} invalidJsonText - The invalid JSON response
     * @param {number} depth - Current recursion depth
     * @param {boolean} isBackgroundJob - Background request flag
     * @returns {Promise<Object>} {ok, repaired?, error?}
     */
    async retryJsonRepair(invalidJsonText, depth = 0, isBackgroundJob = false) {
        const maxDepth = this.aiEngine._aiFixRecursionMaxDepth || 0;

        // Depth 0 = no limit, otherwise check depth
        if (maxDepth > 0 && depth >= maxDepth) {
            return { ok: false, error: 'MAX_RECURSION_DEPTH_REACHED' };
        }

        try {
            const payload = {
                messages: [
                    {
                        role: 'user',
                        content: `Fix this malformed JSON and return ONLY valid JSON, nothing else:\n\n${invalidJsonText}`,
                    },
                ],
            };

            const result = await this.aiEngine.requestChatCompletion(payload, {
                isBackgroundJob,
            });

            if (!result || !result.text) {
                return { ok: false, error: 'EMPTY_RESPONSE' };
            }

            // Try to parse
            try {
                const extracted = StreamJsonParser.extractJsonLike(result.text);
                const parsed = StreamJsonParser.parseObjectStrict(extracted);
                return { ok: true, repaired: parsed };
            } catch (e) {
                // Still invalid, retry recursively
                return this.retryJsonRepair(result.text, depth + 1, isBackgroundJob);
            }
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    /**
     * Split items in half and retry each half separately
     * Fallback when batching fails
     * @param {Array} itemData - Items to split
     * @param {boolean} isBackgroundJob - Background request flag
     * @returns {Promise<Object>} {ok, merged[], error?}
     */
    async splitAndRetry(itemData, isBackgroundJob = false) {
        if (!Array.isArray(itemData) || itemData.length < 2) {
            return { ok: false, error: 'CANNOT_SPLIT_SINGLE_ITEM' };
        }

        const mid = Math.floor(itemData.length / 2);
        const firstHalf = itemData.slice(0, mid);
        const secondHalf = itemData.slice(mid);

        try {
            // Recursively retry both halves
            const firstResult = await this.aiEngine.batchTranslate(firstHalf, {
                backgroundJob: isBackgroundJob,
            });
            const secondResult = await this.aiEngine.batchTranslate(secondHalf, {
                backgroundJob: isBackgroundJob,
            });

            const merged = {
                successes: [
                    ...(firstResult.successes || []),
                    ...(secondResult.successes || []),
                ].map((success) => ({
                    ...success,
                    recoveryUsed: true,
                    recoveryAttempted: true,
                })),
                failures: [...(firstResult.failures || []), ...(secondResult.failures || [])].map(
                    (failure) => ({
                        ...failure,
                        recoveryAttempted: true,
                    })
                ),
                recoveryStrategyUsed: true,
            };

            return { ok: true, merged };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    getResendRetryLimit() {
        const configured = Number(this.aiEngine.aiInvalidJsonResendCount);
        if (!Number.isFinite(configured)) {
            return 3;
        }
        return Math.max(1, Math.floor(configured));
    }

    async resendSameBatch(itemData, isBackgroundJob = false, retryState = null) {
        if (!Array.isArray(itemData) || itemData.length === 0) {
            return { ok: false, error: 'CANNOT_RESEND_EMPTY_BATCH' };
        }

        const remainingRetries =
            retryState && Number.isFinite(Number(retryState.remainingRetries))
                ? Math.max(0, Math.floor(Number(retryState.remainingRetries)))
                : this.getResendRetryLimit();

        if (remainingRetries < 1) {
            return { ok: false, error: 'MAX_RESEND_RETRIES_REACHED' };
        }

        try {
            const retryResult = await this.aiEngine.batchTranslate(itemData, {
                backgroundJob: isBackgroundJob,
                retryState: {
                    strategy: 'resendXTimes',
                    remainingRetries: remainingRetries - 1,
                },
            });

            const merged = {
                successes: (retryResult.successes || []).map((success) => ({
                    ...success,
                    recoveryUsed: true,
                    recoveryAttempted: true,
                })),
                failures: (retryResult.failures || []).map((failure) => ({
                    ...failure,
                    recoveryAttempted: true,
                })),
                recoveryStrategyUsed: true,
            };

            return { ok: true, merged };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }

    /**
     * Call external JSON fixer API (pythonanywhere)
     * @param {string} jsonText - Malformed JSON
     * @returns {Promise<Object>} {ok, repaired?, error?}
     */
    async callExternalJsonFixer(jsonText) {
        if (!this.aiEngine.useJsonFixer) {
            return { ok: false, error: 'JSON_FIXER_DISABLED' };
        }

        try {
            const response = await fetch(this.jsonFixerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ json: jsonText }),
            });

            if (!response.ok) {
                return { ok: false, error: `HTTP_${response.status}` };
            }

            const data = await response.json();

            if (!data.fixed_json) {
                return { ok: false, error: 'NO_FIXED_JSON_IN_RESPONSE' };
            }

            // Try to parse fixed JSON
            const parsed = StreamJsonParser.parseObjectStrict(data.fixed_json);
            return { ok: true, repaired: parsed };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }
}
