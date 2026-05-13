import { parseCacheKeyForLangPair } from '../../js/TranslateCacheRuntime.js';
import { isRpgMakerMv } from '../../js/RpgMakerRuntime.js';
import { BasePhase } from './BasePhase.js';
import { OtherStrings } from './OtherStrings.js';

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
            const parsed = parseCacheKeyForLangPair(
                cacheKey,
                runtime.sourceLang,
                runtime.targetLang
            );
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

    normalizeProjectNamePart(value) {
        return String(value || '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
    }

    resolveProjectNameBase({ runtime }) {
        const otherStrings = OtherStrings.getInstance();
        const titleCacheKey = otherStrings.getTitleCacheKey(runtime);
        const translatedTitle = this.normalizeProjectNamePart(
            titleCacheKey ? runtime.translationCache.get(titleCacheKey) : ''
        );
        if (translatedTitle) {
            return translatedTitle;
        }

        const originalTitle = this.normalizeProjectNamePart(otherStrings.getTitleOriginalValue());
        if (originalTitle) {
            return originalTitle;
        }

        return isRpgMakerMv() ? 'rpmMV' : 'rpmMZ';
    }

    buildProjectId({ runtime, targetLanguage, timestamp = Date.now() }) {
        const base = this.resolveProjectNameBase({ runtime });
        const lang = String(targetLanguage || '').trim() || 'en';
        return `${base}-${lang}-${timestamp}`;
    }
}
