import { parseCacheKeyForLangPair } from '../../js/TranslateCacheRuntime.js';
import { BasePhase } from './BasePhase.js';

export class Koharu extends BasePhase {
    /** @type {Koharu | null} */
    static _instance = null;

    static getInstance() {
        if (!Koharu._instance) {
            Koharu._instance = new Koharu();
        }
        return Koharu._instance;
    }

    getKind() {
        return 'koharu';
    }

    getTranslationPhaseLabel() {
        return 'translating koharu';
    }

    collectAllEntries(context = {}) {
        const runtime = context?.runtime;
        if (!runtime?.translationCache || !runtime?.sourceLang || !runtime?.targetLang) {
            return [];
        }

        const items = [];
        let idCounter = 0;

        for (const [cacheKey, value] of runtime.translationCache.entries()) {
            const parsed = parseCacheKeyForLangPair(cacheKey, runtime.sourceLang, runtime.targetLang);
            if (parsed?.type !== 'koharu') {
                continue;
            }

            const sourceText = typeof parsed.original === 'string' ? parsed.original.trim() : '';
            if (!sourceText) {
                continue;
            }

            items.push({
                type: 'koharu',
                id: `koharu_${idCounter++}`,
                value: parsed.original,
                translatedValue: typeof value === 'string' ? value : '',
                cacheKey,
            });
        }

        return items;
    }

    collectUntranslated(context = {}) {
        const items = this.collectAllEntries(context);
        return items.filter((item) => !item.translatedValue.trim());
    }

    countAmountSync(context = {}) {
        const totalItems = this.collectAllEntries(context);
        const untranslatedItems = totalItems.filter((item) => !item.translatedValue.trim());
        return {
            total: totalItems.length,
            left: untranslatedItems.length,
            totalStrings: totalItems.length,
            leftStrings: untranslatedItems.length,
        };
    }

    async createEntries() {
        return [
            {
                strategy: this,
                priorityMapId: 0,
            },
        ];
    }
}
