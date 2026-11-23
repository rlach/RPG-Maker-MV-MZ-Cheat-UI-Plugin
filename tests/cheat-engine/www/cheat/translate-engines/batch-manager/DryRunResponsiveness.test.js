import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranslationBatchManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManager.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('Mass translation dry-run responsiveness', () => {
    it('defers synchronous DataManager.loadDataFile fallback to a macrotask so UI frames can run between maps', async () => {
        const win = {};
        vi.stubGlobal('window', win);
        vi.stubGlobal('XMLHttpRequest', class FailingXhr {
            open() {}
            send() {
                setTimeout(() => this.onerror?.(), 0);
            }
        });
        const events = [];
        vi.stubGlobal('DataManager', {
            _errors: [],
            loadDataFile(name, src) {
                events.push(`load:${src}`);
                // Simulate a synchronous custom loader (e.g. encrypted archive decrypter).
                win[name] = { data: [1, 2, 3], events: [] };
            },
        });

        const { loadMapDataById } = await import(
            '../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js'
        );

        // First call falls back from XHR to DataManager and remembers the fallback method.
        const map1 = await loadMapDataById(901);
        expect(map1.data).toEqual([1, 2, 3]);

        // Second call uses DataManager directly and must yield to a macrotask before calling loadDataFile.
        events.length = 0;
        const map2Promise = loadMapDataById(902);
        events.push('after-call-sync');
        const map2 = await map2Promise;

        expect(map2.data).toEqual([1, 2, 3]);
        expect(events).toEqual(['after-call-sync', 'load:Map902.json']);
    });

    it('batches dry-run cache persistence and notifications into a single flush at the end', async () => {
        const cache = new Map();
        const setCacheCalls = [];
        const persistCache = vi.fn();
        const notifyCacheRuntime = vi.fn();
        const runtime = {
            sourceLang: 'ja',
            targetLang: 'en',
            translationCache: cache,
            engine: { batchTranslate: vi.fn() },
            getCacheKey: (value, type) => `${type}:ja-en-${value}`,
            hasUsableCacheValue: (key) => Boolean(cache.get(key)),
            setCacheValue(key, value, options = {}) {
                setCacheCalls.push({ key, value, options });
                cache.set(key, value);
            },
            persistCache,
            notifyCacheRuntime,
            markDryRunExecuted: vi.fn(),
            markBatchFailuresAsUntranslated: vi.fn(),
            clearQueueCompletionScope: vi.fn(),
            startQueueCompletionScope: vi.fn(),
            adjustQueueCompletionTotalChars: vi.fn(),
            markQueueCompletionItemsProcessed: vi.fn(),
            getCurrentMapIdForPhasePriority: () => 0,
            isBatchQueueAbortRequested: () => false,
            setProgress: vi.fn(),
            showSpinner: vi.fn(),
            hideSpinner: vi.fn(),
            updateSpinner: vi.fn(),
            updateProgressBox: vi.fn(),
            hideProgressBox: vi.fn(),
            recordBatchThroughputSample: vi.fn(),
        };

        const manager = new TranslationBatchManager(runtime);
        const items = Array.from({ length: 50 }, (_, idx) => ({
            type: 'message',
            id: `m${idx}`,
            value: `原文${idx}`,
            cacheKey: `message:ja-en-原文${idx}`,
        }));
        manager.register({
            getKind: () => 'bulkDryRun',
            createEntries: async () => [{ items }],
        });

        const result = await manager.runBatchedTranslation([{ kind: 'bulkDryRun' }], {
            dryRun: true,
            showSummary: false,
            itemLimit: 10,
        });

        expect(result.summary.uniquePendingKeys).toBe(50);
        // Each key is materialized once (not 3x) with notify suppressed during the loop.
        expect(setCacheCalls).toHaveLength(50);
        expect(setCacheCalls.every((call) => call.options.notify === false)).toBe(true);
        // Persisted and notified once at the end of dry run.
        expect(persistCache).toHaveBeenCalledTimes(1);
        expect(persistCache.mock.calls[0][0]).toHaveLength(50);
        expect(notifyCacheRuntime).toHaveBeenCalledTimes(1);
        expect(notifyCacheRuntime).toHaveBeenCalledWith('cache-set');
    });
});
