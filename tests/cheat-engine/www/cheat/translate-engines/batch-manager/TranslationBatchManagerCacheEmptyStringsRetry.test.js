import { describe, expect, it } from 'vitest';

import { TranslationBatchManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManager.js';
import { CacheEmptyStrings } from '../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/CacheEmptyStrings.js';

function createRuntimeStub() {
    const runtime = {
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map([
            ['message:ja-en-Source message', ''],
            ['skill_description:ja-en-Source description', ''],
        ]),
        failedTranslations: new Map(),
        showSpinner() {},
        hideSpinner() {},
        hideProgressBox() {},
        updateProgressBox() {},
        getOverallTranslationCompletionLine() {
            return '';
        },
        clearQueueCompletionScope() {},
        startQueueCompletionScope() {},
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
        recordBatchThroughputSample() {},
        markBatchFailuresAsUntranslated(failures, markAsFailed = true) {
            for (const failure of failures || []) {
                if (markAsFailed && failure?.cacheKey) {
                    this.failedTranslations.set(failure.cacheKey, Date.now());
                }
            }
        },
        engine: {
            callCount: 0,
            seenBatchValues: [],
            async batchTranslate(batch) {
                this.callCount += 1;
                this.seenBatchValues.push(batch.map((item) => item.value));

                if (this.callCount === 1) {
                    return {
                        successes: [
                            {
                                ...batch[0],
                                translated: 'Message translated',
                            },
                        ],
                        failures: [
                            {
                                ...batch[1],
                                rejectReason: 'Tag count mismatch',
                            },
                        ],
                    };
                }

                return {
                    successes: [
                        {
                            ...batch[0],
                            translated: 'Description translated',
                        },
                    ],
                    failures: [],
                };
            },
        },
    };

    return runtime;
}

describe('TranslationBatchManager cacheEmptyStrings repeat behavior', () => {
    it('retries only unresolved items and keeps successful ones applied', async () => {
        const originalAlert = globalThis.alert;
        globalThis.alert = () => {};

        const runtime = createRuntimeStub();
        const manager = new TranslationBatchManager(runtime);
        manager.register(CacheEmptyStrings.getInstance());

        let result;
        try {
            result = await manager.runBatchedTranslation([
                {
                    kind: 'cacheEmptyStrings',
                    repeatUntilSuccess: true,
                    backgroundJob: false,
                    itemLimit: 50,
                    charLimit: 10000,
                },
            ]);
        } finally {
            if (typeof originalAlert === 'function') {
                globalThis.alert = originalAlert;
            } else {
                delete globalThis.alert;
            }
        }

        expect(runtime.engine.callCount).toBe(2);
        expect(runtime.engine.seenBatchValues[0]).toEqual(['Source message', 'Source description']);
        expect(runtime.engine.seenBatchValues[1]).toEqual(['Source description']);

        expect(runtime.translationCache.get('message:ja-en-Source message')).toBe(
            'Message translated'
        );
        expect(runtime.translationCache.get('skill_description:ja-en-Source description')).toBe(
            'Description translated'
        );

        expect(result.failures).toHaveLength(1);
    });
});
