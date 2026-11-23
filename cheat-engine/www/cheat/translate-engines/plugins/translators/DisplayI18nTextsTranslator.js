/* eslint-disable no-control-regex -- RPG Maker supports ESC-prefixed localization references. */
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import {
    resolveDisplayI18nSource,
    setDisplayI18nSourceDictionary,
} from '../../../js/translation-runtime/NativeI18nSource.js';

/** DisplayI18NTexts dictionary values are the source, never numeric references. */
export class DisplayI18nTextsTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'DisplayI18NTexts';
    }
    getCacheType() {
        return 'plugin_display_i18n_texts';
    }
    resolveMessageCacheSourceText({ text, runtime }) {
        return resolveDisplayI18nSource(text, runtime);
    }
    normalizeTranslationEntry(entry, { runtime } = {}) {
        return { ...entry, value: resolveDisplayI18nSource(entry.value, runtime) };
    }
    async precomputeCounts() {
        if (!this.sourcePromise)
            this.sourcePromise = (async () => {
                const response = await fetch('data/I18NTexts.json');
                if (!response.ok) throw Error(`Cannot read I18NTexts: ${response.status}`);
                this.dictionary = JSON.parse(await response.text());
                setDisplayI18nSourceDictionary(this.dictionary);
            })().catch((error) => {
                this.sourcePromise = null;
                throw error;
            });
        return this.sourcePromise;
    }
    buildSourceItems(runtime) {
        const values = new Set();
        const dictionary = this.dictionary || window.$dataI18nTexts || [];
        for (let id = 0; id < dictionary.length; id++) {
            const value = resolveDisplayI18nSource(`\\I18N[${id}]`, runtime);
            if (this.isUsableText(value) && !/(?:\\|\x1b)I18N\[\d+\]/i.test(value))
                values.add(value);
        }
        return [...values].map((value, id) => ({
            type: this.getCacheType(),
            id: `i18n_${id}`,
            value,
            cacheKey: runtime.getCacheKey(value, this.getCacheType()),
        }));
    }
    collectUntranslated({ runtime }) {
        return this.buildSourceItems(runtime).filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        );
    }
    getCachedCountsSync({ runtime }) {
        const items = this.buildSourceItems(runtime);
        const total = items.length;
        const left = items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey)).length;
        return { total, left, totalStrings: total, leftStrings: left };
    }
    resolveDisplay(text) {
        const runtime = this.getRuntime();
        const source = resolveDisplayI18nSource(text, runtime);
        if (!this.isRuntimeTranslationActive(runtime)) return text;
        return this.resolveRuntimeTranslation(
            source,
            runtime,
            [
                this.getCacheType(),
                'actor_name',
                'command',
                'item_name',
                'skill_name',
                'enemy_name',
                'map_name',
            ],
            { harvestMissing: false }
        );
    }
    enablePluginTranslation() {
        if (typeof window.TextManager?.translate !== 'function') return false;
        const translator = this;
        const native = window.TextManager.translate;
        window.TextManager.translate = function (text) {
            // Off mode retains the native language choice. On mode resolves the
            // configured source dictionary before consulting our translated values.
            if (!translator.isRuntimeTranslationActive()) return native.call(this, text);
            return translator.resolveDisplay(text);
        };
        const message = window.Game_Message?.prototype;
        for (const method of ['allText', 'speakerName', 'choices']) {
            if (typeof message?.[method] !== 'function') continue;
            const original = message[method];
            message[method] = function (...args) {
                const value = original.apply(this, args);
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime)) return value;
                return Array.isArray(value)
                    ? value.map((text) => resolveDisplayI18nSource(text, runtime))
                    : resolveDisplayI18nSource(value, runtime);
            };
        }
        this.precomputeCounts().catch((error) =>
            console.error('[DisplayI18nTexts] Dictionary scan failed', error)
        );
        return true;
    }
}
