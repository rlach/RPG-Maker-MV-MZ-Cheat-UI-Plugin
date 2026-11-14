/**
 * ExtraWindow (MZ, unversioned triacontane release bundled with RJ01084274 v1.01).
 * Catalogs WindowList.Text and translates before escape expansion in drawAllText.
 * Preserves original templates, live variable updates, and original-key seen tracking.
 */
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseStructArraySafely } from './TranslatorHelpers.js';

export class ExtraWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'ExtraWindow';
    }

    getPluginLabel() {
        return 'ExtraWindow';
    }

    getCacheType() {
        return 'plugin_extra_window';
    }

    appendEntriesFromWindowList(rawWindowList, scope, output) {
        const windowEntries = parseStructArraySafely(rawWindowList);
        for (let index = 0; index < windowEntries.length; index++) {
            const entry = windowEntries[index];
            const text = typeof entry.Text === 'string' ? entry.Text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope,
                    windowIndex: index,
                },
            });
        }
    }

    enablePluginTranslation() {
        if (
            !window.Window_SceneExtra?.prototype ||
            typeof Window_SceneExtra.prototype.drawAllText !== 'function'
        ) {
            return false;
        }

        const translator = this;
        const original = Window_SceneExtra.prototype.drawAllText;

        Window_SceneExtra.prototype.drawAllText = function () {
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime)) {
                return original.apply(this, arguments);
            }

            const sourceText = this._data.Text;
            const translated = translator.resolveRuntimeTranslation(sourceText, runtime);
            if (translated === sourceText) return original.apply(this, arguments);

            this._data.Text = translated;
            try {
                return original.apply(this, arguments);
            } finally {
                this._data.Text = sourceText;
            }
        };
        return true;
    }

    async precomputeCounts() {
        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[ExtraWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        this.appendEntriesFromWindowList(
            pluginEntry?.parameters?.WindowList,
            'pluginEntry',
            entries
        );

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_extra_window_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
