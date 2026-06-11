import { describe, expect, it } from 'vitest';

import { TranslationBatchManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManager.js';
import { translateOnTheFlyFlowMethods } from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyFlowMethods.js';

function createRuntimeStub() {
    const runtime = {
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map(),
        batchThroughputSamples: [],
        recordCalls: [],
        progressLines: [],
        dryRunExecutedAtLeastOnce: true,
        showSpinner() {},
        hideSpinner() {},
        hideProgressBox() {},
        updateProgressBox(title, message, totalCompletionLine) {
            this.progressLines.push(totalCompletionLine || '');
        },
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

    return {
        ...translateOnTheFlyFlowMethods,
        ...runtime,
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

    it('updates total queue progress after each batch in a single entry', async () => {
        const originalAlert = globalThis.alert;
        globalThis.alert = () => {};

        const runtime = createRuntimeStub();
        runtime.engine.batchTranslate = async (batch) => ({
            successes: [
                {
                    ...batch[0],
                    translated: `${batch[0].value}-translated`,
                },
            ],
            failures: [],
        });

        const manager = new TranslationBatchManager(runtime);
        manager.register({
            getKind() {
                return 'throughput';
            },
            async createEntries() {
                return [
                    {
                        items: [
                            {
                                type: 'message',
                                cacheKey: 'message:ja-en-aaaaa',
                                value: 'aaaaa',
                            },
                            {
                                type: 'message',
                                cacheKey: 'message:ja-en-bbbbb',
                                value: 'bbbbb',
                            },
                        ],
                    },
                ];
            },
        });

        try {
            await manager.runBatchedTranslation([
                {
                    kind: 'throughput',
                    backgroundJob: false,
                    itemLimit: 10,
                    charLimit: 5,
                },
            ]);
        } finally {
            if (typeof originalAlert === 'function') {
                globalThis.alert = originalAlert;
            } else {
                delete globalThis.alert;
            }
        }

        expect(runtime.progressLines.some((line) => line.startsWith('total 50.0% complete'))).toBe(
            true
        );
    });
});
