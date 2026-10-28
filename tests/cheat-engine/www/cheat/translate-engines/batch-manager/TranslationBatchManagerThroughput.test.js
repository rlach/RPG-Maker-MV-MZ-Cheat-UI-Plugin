import { describe, expect, it } from 'vitest';

import { TranslationBatchManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManager.js';
import { translateOnTheFlyFlowMethods } from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyFlowMethods.js';
import { CacheEmptyStrings } from '../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/CacheEmptyStrings.js';

function createRuntimeStub() {
    const runtime = {
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map(),
        recordCalls: [],
        progressLines: [],
        dryRunExecutedAtLeastOnce: true,
        showSpinner() {},
        hideSpinner() {},
        hideProgressBox() {},
        updateProgressBox(title, message, totalCompletionLine) {
            this.progressLines.push(totalCompletionLine || '');
        },
        isBatchQueueAbortRequested() {
            return false;
        },
        getCurrentMapIdForPhasePriority() {
            return 0;
        },
        hasUsableCacheValue(cacheKey) {
            return (
                this.translationCache.has(cacheKey) && this.translationCache.get(cacheKey) !== ''
            );
        },
        setCacheValue(cacheKey, value) {
            this.translationCache.set(cacheKey, value);
        },
        persistCache() {},
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

    const instance = {
        ...translateOnTheFlyFlowMethods,
        ...runtime,
    };

    const originalRecordBatchThroughputSample = instance.recordBatchThroughputSample.bind(instance);
    instance.recordBatchThroughputSample = (
        requestedChars,
        durationMs,
        progressChannel = 'main'
    ) => {
        instance.recordCalls.push({ requestedChars, durationMs, progressChannel });
        return originalRecordBatchThroughputSample(requestedChars, durationMs, progressChannel);
    };

    return instance;
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
    it('counts a dry-run cache and its ordinary phases once, then estimates only real cleanup failures', async () => {
        const runtime = createRuntimeStub();
        const items = Array.from({ length: 100 }, (_, index) => {
            const value = String(index).padStart(4, '0');
            return { type: 'message', cacheKey: `message:ja-en-${value}`, value };
        });
        for (const item of items) runtime.translationCache.set(item.cacheKey, '');
        const observed = [];
        let calls = 0;
        runtime.engine.batchTranslate = async (batch) => {
            calls++;
            runtime.getBatchThroughputSamples().splice(0, Infinity, 10);
            observed.push({
                stats: runtime.getQueueScopedCompletionStats(),
                eta: runtime.getOverallTranslationCompletionLine(),
                size: batch.length,
                previousProgress: runtime.progressLines.at(-1),
            });
            if (calls === 1)
                return {
                    successes: batch.slice(0, 90).map((item) => ({ ...item, translated: 'ok' })),
                    failures: batch
                        .slice(90)
                        .map((item) => ({ ...item, rejectReason: 'invalid_json' })),
                };
            return {
                successes: batch.map((item) => ({ ...item, translated: 'ok' })),
                failures: [],
            };
        };
        const manager = new TranslationBatchManager(runtime);
        manager.register({ getKind: () => 'ordinary', createEntries: async () => [{ items }] });
        manager.register(new CacheEmptyStrings());
        await manager.runBatchedTranslation(
            [
                { kind: 'ordinary', backgroundJob: false, itemLimit: 100, charLimit: 10000 },
                { kind: 'cacheEmptyStrings', backgroundJob: false, repeatUntilSuccess: true },
            ],
            { showSummary: false }
        );
        expect(calls).toBe(2);
        expect(observed[0].stats.totalChars).toBe(400); // Not 800 after dry run.
        expect(observed[1].size).toBe(10);
        expect(observed[1].stats.totalChars - observed[1].stats.processedChars).toBe(40);
        expect(observed[1].stats.completionPercent).toBeGreaterThan(89);
        expect(observed[1].stats.completionPercent).toBeLessThan(92);
        expect(observed[1].eta).toContain('ETA 4s');
        expect(observed[1].previousProgress).not.toContain('ETA 0s');
    });

    it('deduplicates identical cache keys across phases but keeps equal text in distinct categories', async () => {
        const runtime = createRuntimeStub();
        const observed = [];
        const item = { type: 'message', cacheKey: 'message:ja-en-hello', value: 'hello' };
        const otherType = {
            ...item,
            type: 'item_description',
            cacheKey: 'item_description:ja-en-hello',
        };
        runtime.engine.batchTranslate = async (batch) => {
            observed.push(runtime.getQueueScopedCompletionStats());
            return {
                successes: batch.map((value) => ({ ...value, translated: 'ok' })),
                failures: [],
            };
        };
        const manager = new TranslationBatchManager(runtime);
        manager.register({
            getKind: () => 'overlapping',
            createEntries: async () => [{ items: [item] }, { items: [item, otherType] }],
        });
        await manager.runBatchedTranslation([{ kind: 'overlapping', backgroundJob: false }], {
            showSummary: false,
        });
        expect(observed[0].totalChars).toBe(10);
    });

    it('includes cache-only leftovers that do not belong to any ordinary phase', async () => {
        const runtime = createRuntimeStub();
        const item = { type: 'message', cacheKey: 'message:ja-en-aaaaa', value: 'aaaaa' };
        runtime.translationCache.set(item.cacheKey, '');
        runtime.translationCache.set('message:ja-en-bbbbb', '');
        const observed = [];
        runtime.engine.batchTranslate = async (batch) => {
            observed.push({
                remaining:
                    runtime.getQueueScopedCompletionStats().totalChars -
                    runtime.getQueueScopedCompletionStats().processedChars,
                values: batch.map((value) => value.value),
            });
            return {
                successes: batch.map((value) => ({ ...value, translated: 'ok' })),
                failures: [],
            };
        };
        const manager = new TranslationBatchManager(runtime);
        manager.register({
            getKind: () => 'ordinary',
            createEntries: async () => [{ items: [item] }],
        });
        manager.register(new CacheEmptyStrings());
        await manager.runBatchedTranslation(
            [
                { kind: 'ordinary', backgroundJob: false },
                { kind: 'cacheEmptyStrings', backgroundJob: false },
            ],
            { showSummary: false }
        );
        expect(observed).toEqual([
            { remaining: 10, values: ['aaaaa'] },
            { remaining: 5, values: ['bbbbb'] },
        ]);
    });

    it('keeps remaining work in the ETA across repeated empty-string passes', async () => {
        const runtime = createRuntimeStub();
        runtime.translationCache = new Map([
            ['message:ja-en-aaaaa', ''],
            ['message:ja-en-bbbbb', ''],
        ]);
        let attempts = 0;
        const observed = [];
        runtime.engine.batchTranslate = async (batch) => {
            attempts++;
            runtime.getBatchThroughputSamples().push(5);
            observed.push(runtime.getQueueScopedCompletionStats());
            expect(runtime.getOverallTranslationCompletionLine()).not.toContain('ETA 0s');
            return attempts < 3
                ? {
                      successes: [],
                      failures: batch.map((item) => ({ ...item, rejectReason: 'invalid_json' })),
                  }
                : { successes: batch.map((item) => ({ ...item, translated: 'ok' })), failures: [] };
        };
        const manager = new TranslationBatchManager(runtime);
        manager.register(new CacheEmptyStrings());
        await manager.runBatchedTranslation(
            [
                {
                    kind: 'cacheEmptyStrings',
                    repeatUntilSuccess: true,
                    backgroundJob: false,
                    itemLimit: 50,
                    charLimit: 10000,
                },
            ],
            { showSummary: false }
        );
        expect(attempts).toBe(3);
        expect(observed.map((stats) => stats.totalChars - stats.processedChars)).toEqual([
            10, 10, 10,
        ]);
    });

    it('adds work discovered by a later phase and includes it on every retry', async () => {
        const runtime = createRuntimeStub();
        let attempts = 0;
        const observed = [];
        runtime.engine.batchTranslate = async (batch) => {
            attempts++;
            observed.push(runtime.getQueueScopedCompletionStats());
            return attempts === 1
                ? {
                      successes: [],
                      failures: batch.map((item) => ({ ...item, rejectReason: 'invalid_json' })),
                  }
                : { successes: batch.map((item) => ({ ...item, translated: 'ok' })), failures: [] };
        };
        const manager = new TranslationBatchManager(runtime);
        manager.register({
            getKind: () => 'discover',
            createEntries: async () => [
                {
                    execute: async () => {
                        runtime.translationCache.set('message:ja-en-new work', '');
                        return { successes: [], failures: [] };
                    },
                },
            ],
        });
        manager.register(new CacheEmptyStrings());
        await manager.runBatchedTranslation(
            [
                { kind: 'discover' },
                { kind: 'cacheEmptyStrings', repeatUntilSuccess: true, backgroundJob: false },
            ],
            { showSummary: false }
        );
        expect(observed.map((stats) => stats.totalChars - stats.processedChars)).toEqual([8, 8]);
    });

    it('counts lazily created strategy work before its first request', async () => {
        const runtime = createRuntimeStub();
        const manager = new TranslationBatchManager(runtime);
        const observed = [];
        runtime.engine.batchTranslate = async (batch) => {
            observed.push(runtime.getQueueScopedCompletionStats());
            return {
                successes: batch.map((item) => ({ ...item, translated: 'ok' })),
                failures: [],
            };
        };
        manager.register({
            getKind: () => 'mapEvents',
            createEntries: async () => [
                {
                    createStrategy: async () => ({
                        getTranslationPhaseLabel: () => 'lazy map',
                        collectUntranslated: () => [
                            { type: 'message', value: 'abcde', cacheKey: 'message:ja-en-abcde' },
                        ],
                        setData() {},
                    }),
                },
            ],
        });
        await manager.runBatchedTranslation([{ kind: 'mapEvents', backgroundJob: false }], {
            showSummary: false,
        });
        expect(observed[0]).toMatchObject({ totalChars: 5, processedChars: 0 });
    });

    it('uses actual cache character totals when there is no queue scope', () => {
        const runtime = createRuntimeStub();
        runtime.translationCache = new Map([
            ['message:ja-en-aaaaa', 'done'],
            ['message:ja-en-bbbbb', ''],
        ]);
        runtime.getBatchThroughputSamples().push(1);
        expect(runtime.getOverallTranslationCompletionLine()).toBe('total 50.0% complete (ETA 5s)');
    });

    it('does not round unfinished work to 100 percent or zero seconds', () => {
        const runtime = createRuntimeStub();
        runtime.startQueueCompletionScope(['message'], 10000);
        runtime.markQueueCompletionItemsProcessed([{ value: 'x'.repeat(9999) }]);
        runtime.getBatchThroughputSamples().push(1000);
        expect(runtime.getOverallTranslationCompletionLine()).toBe('total 99.9% complete (ETA 1s)');
    });

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
        runtime.getBatchThroughputSamples('main').push(999);

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

        expect(runtime.getBatchThroughputSamples('main')).toHaveLength(1);
        expect(runtime.getBatchThroughputSamples('main')[0]).not.toBe(999);
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
        expect(runtime.getBatchThroughputSamples('main')).toEqual([]);
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

    it('foreground queue does not reset main queue ETA/progress state', async () => {
        const originalNow = Date.now;
        let now = 5000;
        Date.now = () => {
            now += 100;
            return now;
        };

        const originalAlert = globalThis.alert;
        globalThis.alert = () => {};

        const runtime = createRuntimeStub();

        const mainManager = new TranslationBatchManager(runtime, { progressChannel: 'main' });
        const foregroundManager = new TranslationBatchManager(runtime, {
            progressChannel: 'foreground',
        });
        mainManager.register(createThroughputDefinition());
        foregroundManager.register(createThroughputDefinition());

        runtime.startQueueCompletionScope(['message'], 100);
        runtime.markQueueCompletionItemsProcessed([{ value: 'x'.repeat(20) }]);
        runtime.getBatchThroughputSamples('main').push(10, 20);

        const beforeLine = runtime.getOverallTranslationCompletionLine();

        try {
            await foregroundManager.runBatchedTranslation([
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

        const afterLine = runtime.getOverallTranslationCompletionLine();

        expect(beforeLine).toContain('total 20.0% complete');
        expect(afterLine).toContain('total 20.0% complete');
        expect(runtime.getBatchThroughputSamples('main').length).toBeGreaterThanOrEqual(2);
    });
});
