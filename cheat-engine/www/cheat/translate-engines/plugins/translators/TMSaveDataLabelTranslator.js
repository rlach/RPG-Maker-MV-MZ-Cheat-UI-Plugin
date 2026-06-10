// TMSaveDataLabelTranslator.js
// Translator for TMSaveDataLabel.js (v2.0.0, MV).
// Translates label names/footers configured in plugin parameters and applies
// runtime translation in Window_SavefileList#drawSaveDataLabel.

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const PARAM_FIELDS = ['labelAName', 'labelAFooter', 'labelBName', 'labelBFooter'];

export class TMSaveDataLabelTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'TMSaveDataLabel';
    }

    getPluginLabel() {
        return 'TM SaveDataLabel';
    }

    getCacheType() {
        return 'plugin_tm_save_data_label';
    }

    trackObservedText(runtime, text) {
        if (!runtime || !this.isUsableText(text)) {
            return;
        }

        const cacheKey = runtime.getCacheKey(text, this.getCacheType());
        runtime.trackCacheKeyUsage(cacheKey);
    }

    translateObservedText(runtime, text) {
        if (!this.isUsableText(text)) {
            return text;
        }

        return this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: text,
        });
    }

    enablePluginTranslation() {
        const savefileListProto = window.Window_SavefileList?.prototype;
        if (!savefileListProto) {
            return false;
        }

        if (typeof savefileListProto.drawSaveDataLabel !== 'function') {
            return false;
        }

        if (savefileListProto.__CHEAT_TM_SAVE_DATA_LABEL_TRANSLATOR_HOOKED__) {
            return true;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const trackObservedText = this.trackObservedText.bind(this);
        const translateObservedText = this.translateObservedText.bind(this);
        const originalDrawSaveDataLabel = savefileListProto.drawSaveDataLabel;

        savefileListProto.drawSaveDataLabel = function (x, y, label) {
            if (!label || typeof label !== 'object') {
                return originalDrawSaveDataLabel.call(this, x, y, label);
            }

            try {
                const runtime = getRuntime();
                const sourceName = label.name;
                const sourceFooter = label.footer;

                trackObservedText(runtime, sourceName);
                trackObservedText(runtime, sourceFooter);

                if (!isRuntimeTranslationActive(runtime)) {
                    return originalDrawSaveDataLabel.call(this, x, y, label);
                }

                const translatedName = translateObservedText(runtime, sourceName);
                const translatedFooter = translateObservedText(runtime, sourceFooter);

                if (translatedName === sourceName && translatedFooter === sourceFooter) {
                    return originalDrawSaveDataLabel.call(this, x, y, label);
                }

                const nextLabel = {
                    ...label,
                    name: translatedName,
                    footer: translatedFooter,
                };

                return originalDrawSaveDataLabel.call(this, x, y, nextLabel);
            } catch (error) {
                console.warn(
                    '[TMSaveDataLabelTranslator] Failed to apply drawSaveDataLabel translation',
                    error
                );
            }

            return originalDrawSaveDataLabel.call(this, x, y, label);
        };

        savefileListProto.__CHEAT_TM_SAVE_DATA_LABEL_TRANSLATOR_HOOKED__ = true;
        return true;
    }

    async precomputeCounts() {
        if (!this.ensureDetection()) {
            return;
        }

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
                console.warn('[TMSaveDataLabelTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const field of PARAM_FIELDS) {
            const text = String(parameters[field] || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope,
                    field,
                },
            });
        }
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        const pluginManager = window.PluginManager;
        if (typeof pluginManager?.parameters === 'function') {
            const runtimeParameters = pluginManager.parameters(this.getPluginName());
            this.appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    ensureScanEntriesSync() {
        if (this._scanPrepared) {
            return;
        }

        this._scanEntries = this.buildScanEntries();
        this._scanPrepared = true;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `tm_save_data_label_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime } = {}) {
        if (!runtime) {
            return [];
        }

        this.ensureScanEntriesSync();
        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime } = {}) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        this.ensureScanEntriesSync();
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
