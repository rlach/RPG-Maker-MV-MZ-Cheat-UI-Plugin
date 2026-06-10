import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * YEP_EquipCore.js translator
 *
 * Supported plugin versions:
 * - v1.11 (MV)
 *
 * Translation notes:
 * - Collects plugin parameter strings from the enabled plugin entry for:
 *   `Empty Text` and `Remove Text`.
 * - Applies runtime translation at the equip-scene draw points:
 *   Window_EquipSlot.drawEmptySlot() and Window_EquipItem.drawRemoveEquip().
 * - Seen tracking is driven from those runtime observation points using the
 *   original parameter strings.
 */

const PLUGIN_NAME = 'YEP_EquipCore';
const CACHE_TYPE = 'plugin_yep_equip_core';
const TRANSLATABLE_PARAMETER_KEYS = Object.freeze(['Empty Text', 'Remove Text']);

export class YepEquipCoreTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'YEP Equip Core';
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
            })
            .catch((error) => {
                console.warn('[YepEquipCoreTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const parameters = this._resolvePluginParameters();
        if (!parameters) {
            return entries;
        }

        for (const paramKey of TRANSLATABLE_PARAMETER_KEYS) {
            const text = String(parameters[paramKey] || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            entries.push({
                text,
                source: {
                    scope: 'pluginParam',
                    paramKey,
                },
            });
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
        if (
            typeof Window_EquipSlot === 'undefined' ||
            !Window_EquipSlot.prototype ||
            typeof Window_EquipSlot.prototype.drawEmptySlot !== 'function' ||
            typeof Window_EquipItem === 'undefined' ||
            !Window_EquipItem.prototype ||
            typeof Window_EquipItem.prototype.drawRemoveEquip !== 'function'
        ) {
            return false;
        }

        const originalDrawEmptySlot = Window_EquipSlot.prototype.drawEmptySlot;
        const originalDrawRemoveEquip = Window_EquipItem.prototype.drawRemoveEquip;
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();

        Window_EquipSlot.prototype.drawEmptySlot = function (wx, wy, ww) {
            const originalText = String(window.Yanfly?.Param?.EquipEmptyText || '');
            let translatedText = originalText;

            try {
                const runtime = getRuntime();
                if (runtime && isUsableText(originalText)) {
                    if (isRuntimeTranslationActive(runtime)) {
                        translatedText = resolveRuntimeTranslation(
                            originalText,
                            runtime,
                            cacheType,
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: originalText,
                            }
                        );
                    } else {
                        const cacheKey = runtime.getCacheKey(originalText, cacheType);
                        runtime.trackCacheKeyUsage(cacheKey);
                    }
                }
            } catch (error) {
                console.warn(
                    '[YepEquipCoreTranslator] Failed to translate empty equip text',
                    error
                );
            }

            if (translatedText === originalText) {
                return originalDrawEmptySlot.call(this, wx, wy, ww);
            }

            this.changePaintOpacity(false);
            const ibw = Window_Base._iconWidth + 4;
            this.resetTextColor();
            this.drawIcon(window.Yanfly.Icon.EmptyEquip, wx + 2, wy + 2);
            this.drawText(translatedText, wx + ibw, wy, ww - ibw);
        };

        Window_EquipItem.prototype.drawRemoveEquip = function (index) {
            const originalText = String(window.Yanfly?.Param?.EquipRemoveText || '');
            let translatedText = originalText;

            try {
                const runtime = getRuntime();
                if (runtime && isUsableText(originalText)) {
                    if (isRuntimeTranslationActive(runtime)) {
                        translatedText = resolveRuntimeTranslation(
                            originalText,
                            runtime,
                            cacheType,
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: originalText,
                            }
                        );
                    } else {
                        const cacheKey = runtime.getCacheKey(originalText, cacheType);
                        runtime.trackCacheKeyUsage(cacheKey);
                    }
                }
            } catch (error) {
                console.warn(
                    '[YepEquipCoreTranslator] Failed to translate remove equip text',
                    error
                );
            }

            if (translatedText === originalText) {
                return originalDrawRemoveEquip.call(this, index);
            }

            if (!this.isEnabled(null)) return;
            const rect = this.itemRect(index);
            rect.width -= this.textPadding();
            this.changePaintOpacity(true);
            const ibw = Window_Base._iconWidth + 4;
            this.resetTextColor();
            this.drawIcon(window.Yanfly.Icon.RemoveEquip, rect.x + 2, rect.y + 2);
            this.drawText(translatedText, rect.x + ibw, rect.y, rect.width - ibw);
        };

        return true;
    }

    _resolvePluginParameters() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            return pluginEntry.parameters;
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const parameters = window.PluginManager.parameters(this.getPluginName());
            if (parameters && typeof parameters === 'object') {
                return parameters;
            }
        }

        return null;
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

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
                id: `yep_equip_core_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
