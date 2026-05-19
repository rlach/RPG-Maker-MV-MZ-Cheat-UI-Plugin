// SaveFilePlusTranslator.js
// Translator for SaveFilePlus.js (Ver.2.2.1, MV/MZ)
// Translates SaveFilePlus plugin parameter labels at runtime and for Mass Translate.
// The plugin caches parameters into local constants, so runtime translation is applied by wrapping Window_SavefileList text rendering.

import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

export class SaveFilePlusTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
    }

    getPluginName() {
        return 'SaveFilePlus';
    }

    getPluginLabel() {
        return 'SaveFilePlus (Save UI)';
    }

    getCacheType() {
        return 'plugin_savefileplus';
    }

    async precomputeCounts(context = {}) {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        this._scanEntries = this._buildScanEntries();
        this._scanPrepared = true;
    }

    _buildInfo1Parameters() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const parameters = pluginEntry?.parameters;
        const info1 = parseJsonSafely(parameters?.info1, {});
        info1.dataList = info1.dataList ? String(info1.dataList).split(',') : [];
        if (!info1.variableId) {
            info1.dataList = info1.dataList.filter((data) => data !== 'variable');
        }
        if (!info1.variableId2) {
            info1.dataList = info1.dataList.filter((data) => data !== 'variable2');
        }
        return info1;
    }

    _buildScanEntries() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const parameters = pluginEntry?.parameters;
        if (!parameters) {
            return [];
        }

        const entries = [];
        const noData = String(parameters.noData || '').trim();
        if (noData) {
            entries.push({ text: noData, source: { paramKey: 'noData' } });
        }

        const info1 = this._buildInfo1Parameters();
        const terms = parseJsonSafely(info1.terms, {});
        for (const key of info1.dataList) {
            const value = String(terms[key] || '').trim();
            if (value) {
                entries.push({ text: value, source: { paramKey: `info1.terms.${key}` } });
            }
        }

        return entries;
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = String(entry.text || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `savefileplus_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }
        return Array.from(byCacheKey.values());
    }

    collectUntranslated(context = {}) {
        const runtime = context.runtime;
        if (!runtime) {
            return [];
        }

        if (!this._scanPrepared) {
            this._scanEntries = this._buildScanEntries();
            this._scanPrepared = true;
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync(context = {}) {
        const runtime = context.runtime;
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        if (!this._scanPrepared) {
            this._scanEntries = this._buildScanEntries();
            this._scanPrepared = true;
        }

        const items = this._buildUniquePendingItems(runtime);
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

    enablePluginTranslation() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (!pluginEntry?.parameters) {
            return false;
        }

        if (typeof Window_SavefileList?.prototype?.drawText !== 'function') {
            return false;
        }

        if (Window_SavefileList.prototype._saveFilePlusTranslatorInstalled) {
            return true;
        }

        const parameters = pluginEntry.parameters;
        const originalNoData = String(parameters.noData || '').trim();
        const info1 = this._buildInfo1Parameters();
        const originalTerms = parseJsonSafely(info1.terms, {});
        const sourceTexts = new Set([
            originalNoData,
            ...Object.values(originalTerms).map((value) => String(value || '')),
        ]);

        const translateText = (text) => {
            if (!this.isUsableText(text)) {
                return text;
            }

            const runtime = this.getRuntime();
            if (!this.isRuntimeTranslationActive(runtime)) {
                return text;
            }

            return this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
                missValue: text,
            });
        };

        const originalDrawText = Window_SavefileList.prototype.drawText;
        Window_SavefileList.prototype.drawText = function (text, x, y, maxWidth, align) {
            let renderedText = text;
            try {
                if (typeof text === 'string' && text.trim() && sourceTexts.has(text)) {
                    renderedText = translateText(text);
                }
            } catch (error) {
                console.warn('[SaveFilePlusTranslator] drawText translation hook failed', error);
            }
            return originalDrawText.call(this, renderedText, x, y, maxWidth, align);
        };

        Object.defineProperty(Window_SavefileList.prototype, '_saveFilePlusTranslatorInstalled', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: true,
        });

        return true;
    }
}
