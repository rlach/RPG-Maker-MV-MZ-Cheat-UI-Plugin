import { BasePluginTranslator } from '../BasePluginTranslator.js';

/*
 * EquipInfoAllView.js translator.
 *
 * Supported versions:
 * - EquipInfoAllView.js Ver1.0.0 (MV)
 *
 * Translation notes:
 * - Translatable text is plugin-parameter driven (manual1/manual2/manual3).
 * - Runtime hook targets Window_ShopStatus.drawManual, translating only the
 *   rendered manual lines and preserving original drawing/layout behavior.
 */

const PLUGIN_NAME = 'EquipInfoAllView';
const CACHE_TYPE = 'plugin_equip_info_all_view';
const PARAM_KEYS = ['manual1', 'manual2', 'manual3'];

export class EquipInfoAllViewTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownSourceTexts = new Set();
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'EquipInfoAllView';
    }

    getCacheType() {
        return CACHE_TYPE;
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
                this._knownSourceTexts = new Set(
                    this._scanEntries
                        .map((entry) => (typeof entry?.text === 'string' ? entry.text : ''))
                        .filter((text) => this.isUsableText(text))
                );
            })
            .catch((error) => {
                console.warn('[EquipInfoAllViewTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        for (const source of this._resolveParameterSources()) {
            for (const key of PARAM_KEYS) {
                const text = source.parameters?.[key];
                if (typeof text !== 'string' || !this.isUsableText(text)) {
                    continue;
                }

                entries.push({
                    text,
                    source: {
                        scope: source.scope,
                        field: key,
                    },
                });
            }
        }

        return entries;
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
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
        const shopStatusProto = window.Window_ShopStatus?.prototype;
        if (!shopStatusProto || typeof shopStatusProto.drawManual !== 'function') {
            return false;
        }

        if (shopStatusProto.__CHEAT_EQUIP_INFO_ALL_VIEW_TRANSLATOR_HOOKED__) {
            return true;
        }

        this._ensureScanEntriesPreparedForRuntime();

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const knownSourceTexts = this._knownSourceTexts;

        const originalDrawManual = shopStatusProto.drawManual;
        shopStatusProto.drawManual = function () {
            const runtime = getRuntime();
            if (!runtime || !isRuntimeTranslationActive(runtime)) {
                return originalDrawManual.apply(this, arguments);
            }

            const originalDrawText = this.drawText;
            this.drawText = function (text) {
                let nextText = text;
                if (typeof text === 'string' && knownSourceTexts.has(text)) {
                    nextText = resolveRuntimeTranslation(text, runtime, CACHE_TYPE, {
                        requireRuntimeTranslationActive: true,
                        missValue: text,
                    });
                }

                const nextArguments = Array.from(arguments);
                nextArguments[0] = nextText;
                return originalDrawText.apply(this, nextArguments);
            };

            try {
                return originalDrawManual.apply(this, arguments);
            } finally {
                this.drawText = originalDrawText;
            }
        };

        Object.defineProperty(shopStatusProto, '__CHEAT_EQUIP_INFO_ALL_VIEW_TRANSLATOR_HOOKED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    _resolveParameterSources() {
        const sources = [];
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            sources.push({
                scope: 'pluginEntryParameter',
                parameters: pluginEntry.parameters,
            });
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const runtimeParameters = window.PluginManager.parameters(this.getPluginName());
            if (runtimeParameters && typeof runtimeParameters === 'object') {
                sources.push({
                    scope: 'runtimePluginManagerParameter',
                    parameters: runtimeParameters,
                });
            }
        }

        return sources;
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
            this._knownSourceTexts = new Set(
                this._scanEntries
                    .map((entry) => (typeof entry?.text === 'string' ? entry.text : ''))
                    .filter((text) => this.isUsableText(text))
            );
        }

        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_equip_info_all_view_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }

    _ensureScanEntriesPreparedForRuntime() {
        if (this._scanPrepared) {
            return;
        }

        this._scanEntries = this.buildScanEntries();
        this._scanPrepared = true;
        this._knownSourceTexts = new Set(
            this._scanEntries
                .map((entry) => (typeof entry?.text === 'string' ? entry.text : ''))
                .filter((text) => this.isUsableText(text))
        );
    }
}
