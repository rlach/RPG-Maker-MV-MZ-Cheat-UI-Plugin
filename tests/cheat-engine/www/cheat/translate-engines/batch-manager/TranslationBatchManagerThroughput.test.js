import { describe, expect, it } from 'vitest';

import { TranslationBatchManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManager.js';

function createRuntimeStub() {
    return {
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map(),
        batchThroughputSamples: [],
        recordCalls: [],
        showSpinner() {},
        hideSpinner() {},
        hideProgressBox() {},
        updateProgressBox() {},
        getOverallTranslationCompletionLine() {
            return '';
        },
        clearQueueCompletionScope() {},
        startQueueCompletionScope() {},
        clearBatchThroughputSamples() {
            this.batchThroughputSamples = [];
        },
        isBatchQueueAbortRequested() {
            return false;
        },
        getCurrentMapIdForPhasePriority() {
            return 0;
        },
        hasUsableCacheValue(cacheKey) {
            return this.translationCache.has(cacheKey) && this.translationCache.get(cacheKey) !== '';
        },
        setCacheValue(cacheKey, value) {
            this.translationCache.set(cacheKey, value);
        },
        persistCache() {},
        recordBatchThroughputSample(requestedChars, durationMs) {
            this.recordCalls.push({ requestedChars, durationMs });
            this.batchThroughputSamples.push(requestedChars / Math.max(1, durationMs));
        },
        markBatchFailuresAsUntranslated() {},
        engine: {
            async batchTranslate(batch) {
                return {
                    successes: [
                        {
                            ...batch[0],
                            translated: 'translated text',
                        },
                    ],
                    failures: [],
                };
            },
        },
        batchTranslateWithBackgroundRetry(batch) {
            return this.engine.batchTranslate(batch);
        },
    };
}

function createThroughputDefinition() {
    return {
        getKind() {
            return 'throughput';
        },
        async createEntries() {
            return [
                {
                    items: [
                        {
                            type: 'message',
                            cacheKey: 'message:ja-en-hello',
                            value: 'hello',
                        },
                    ],
                },
            ];
        },
    };
}

describe('TranslationBatchManager throughput sampling', () => {
    it('clears old throughput samples when a queue starts', async () => {
        const originalNow = Date.now;
        let now = 1000;
        Date.now = () => {
            now += 100;
            return now;
        };

        const originalAlert = globalThis.alert;
        globalThis.alert = () => {};

        const runtime = createRuntimeStub();
        runtime.batchThroughputSamples = [999];

        const manager = new TranslationBatchManager(runtime);
        manager.register(createThroughputDefinition());

        try {
            await manager.runBatchedTranslation([
                {
                    kind: 'throughput',
                    backgroundJob: false,
                    itemLimit: 50,
                    charLimit: 10000,
                },
            ]);
        } finally {
            Date.now = originalNow;
            if (typeof originalAlert === 'function') {
                globalThis.alert = originalAlert;
            } else {
                delete globalThis.alert;
            }
        }

        expect(runtime.batchThroughputSamples).toHaveLength(1);
        expect(runtime.batchThroughputSamples[0]).not.toBe(999);
        expect(runtime.recordCalls).toHaveLength(1);
    });

    it('does not record aborted batches into throughput samples', async () => {
        const originalNow = Date.now;
        let now = 2000;
        Date.now = () => {
            now += 100;
            return now;
        };

        const originalAlert = globalThis.alert;
        globalThis.alert = () => {};

        const runtime = createRuntimeStub();
        runtime.engine.batchTranslate = async (batch) => ({
            successes: [],
            failures: batch.map((item) => ({
                ...item,
                rejectReason: 'request_aborted',
                cancelReason: 'request_aborted',
            })),
        });

        const manager = new TranslationBatchManager(runtime);
        manager.register(createThroughputDefinition());

        try {
            await manager.runBatchedTranslation([
                {
                    kind: 'throughput',
                    backgroundJob: false,
                    itemLimit: 50,
                    charLimit: 10000,
                },
            ]);
        } finally {
            Date.now = originalNow;
            if (typeof originalAlert === 'function') {
                globalThis.alert = originalAlert;
            } else {
                delete globalThis.alert;
            }
        }

        expect(runtime.recordCalls).toHaveLength(0);
        expect(runtime.batchThroughputSamples).toEqual([]);
    });
});
