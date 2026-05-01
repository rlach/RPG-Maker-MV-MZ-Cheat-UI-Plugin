import { parseCacheKeyForLangPair } from '../../js/TranslateCacheRuntime.js';
import { BasePhase } from './BasePhase.js';

export class CacheEmptyStrings extends BasePhase {
    static getInstance() {
        if (!CacheEmptyStrings._instance) {
            CacheEmptyStrings._instance = new CacheEmptyStrings();
        }
        return CacheEmptyStrings._instance;
    }

    getKind() {
        return 'cacheEmptyStrings';
    }

    getTranslationPhaseLabel() {
        return 'translate empty strings';
    }

    collectUntranslated({ panel } = {}) {
        if (!panel?.translationCache || !panel?.sourceLang || !panel?.targetLang) {
            return [];
        }

        const items = [];
        let idCounter = 0;

        for (const [cacheKey, value] of panel.translationCache.entries()) {
            const parsed = parseCacheKeyForLangPair(cacheKey, panel.sourceLang, panel.targetLang);
            if (!parsed) {
                continue;
            }

            const currentValue = typeof value === 'string' ? value : '';
            if (currentValue !== '') {
                continue;
            }

            const original = typeof parsed.original === 'string' ? parsed.original.trim() : '';
            if (!original) {
                continue;
            }

            items.push({
                type: parsed.type,
                id: `cache_empty_${idCounter++}`,
                value: parsed.original,
                cacheKey,
            });
        }

        return items;
    }

    countAmountSync({ panel } = {}) {
        const items = this.collectUntranslated({ panel });
        const count = items.length;
        return {
            total: count,
            left: count,
            totalStrings: count,
            leftStrings: count,
        };
    }

    async createEntries({ request }) {
        const repeatUntilSuccess = !!request.repeatUntilSuccess;
        const dryRun = !!request.dryRun;
        const countUntranslated = (panel) => this.collectUntranslated({ panel }).length;

        return [
            {
                priorityMapId: 0,
                strategy: this,
                shouldRepeat(result, { panel, executionOptions } = {}) {
                    if (!repeatUntilSuccess) {
                        return false;
                    }

                    const isDryRun = !!executionOptions?.dryRun;
                    if (dryRun || isDryRun) {
                        return false;
                    }

                    const failures = Array.isArray(result?.failures) ? result.failures : [];
                    if (
                        failures.length > 0 &&
                        failures.every((failure) => failure?.rejectReason === 'dry_run')
                    ) {
                        return false;
                    }

                    return countUntranslated(panel) > 0;
                },
            },
        ];
    }
}
