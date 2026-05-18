import { parseCacheKeyForLangPair } from '../../js/TranslateCacheRuntime.js';
import { BasePhase } from './BasePhase.js';

export class DescriptionsCleanup extends BasePhase {
    static getInstance() {
        if (!DescriptionsCleanup._instance) {
            DescriptionsCleanup._instance = new DescriptionsCleanup();
        }
        return DescriptionsCleanup._instance;
    }

    /** @type {string[]} */
    _cacheTypes = [];

    /** @type {string} */
    _boxingSystemMessage = '';

    getKind() {
        return 'descriptionsCleanup';
    }

    getTranslationPhaseLabel() {
        return 'descriptions cleanup';
    }

    configure(cacheTypes, boxingSystemMessage) {
        this._cacheTypes = Array.isArray(cacheTypes) ? cacheTypes : [];
        this._boxingSystemMessage = typeof boxingSystemMessage === 'string' ? boxingSystemMessage : '';
    }

    collectUntranslated({ runtime } = {}) {
        if (!runtime?.translationCache || !runtime?.sourceLang || !runtime?.targetLang) {
            return [];
        }

        const typeSet = new Set(this._cacheTypes);
        const items = [];
        let idCounter = 0;

        for (const [cacheKey, value] of runtime.translationCache.entries()) {
            const parsed = parseCacheKeyForLangPair(cacheKey, runtime.sourceLang, runtime.targetLang);
            if (!parsed) {
                continue;
            }

            if (!typeSet.has(parsed.type)) {
                continue;
            }

            const currentValue = typeof value === 'string' ? value : '';
            if (currentValue === '') {
                // Skip untranslated entries
                continue;
            }

            // Use the existing translation as the value to send to LLM for reformatting
            items.push({
                type: parsed.type,
                id: `desc_cleanup_${idCounter++}`,
                value: currentValue,
                cacheKey,
            });
        }

        return items;
    }

    setData({ runtime, successes }) {
        for (const success of successes || []) {
            if (!success || !success.cacheKey) {
                continue;
            }
            runtime.setCacheValue(success.cacheKey, success.translated);
        }
        // Failures are intentionally ignored — keep original translations on failure
    }

    async createEntries({ request }) {
        const { cacheTypes = [], boxingSystemMessage = '' } = request;
        this.configure(cacheTypes, boxingSystemMessage);

        const boxingSystemMsg = this._boxingSystemMessage;

        return [
            {
                priorityMapId: 0,
                strategy: this,
                boxingMode: true,
                boxingSystemMessage: boxingSystemMsg,
            },
        ];
    }
}
