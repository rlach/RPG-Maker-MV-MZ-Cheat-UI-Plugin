import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * MPP_RemovoEquipText.js translator
 *
 * Supported plugin versions:
 * - ver.1.1 (MV)
 *
 * Translation notes:
 * - Collects the plugin parameter `Text` from plugin entry/runtime parameters.
 * - Applies runtime translation at `Window_EquipItem.drawItem` for the plugin's
 *   null-item remove-entry row.
 * - Runtime lookup uses the original authored `Text` value as cache key source.
 */

const PLUGIN_NAME = 'MPP_RemovoEquipText';
const CACHE_TYPE = 'plugin_mpp_removo_equip_text';
const PARAM_TEXT = 'Text';
const PARAM_TEXT_X = 'Text X';
const PARAM_TEXT_ENABLED = 'Text Enabled';

export class MppRemovoEquipTextTranslator extends BasePluginTranslator {
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
        return 'MPP RemovoEquipText';
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
                console.warn('[MppRemovoEquipTextTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        for (const source of this._resolveParameterSources()) {
            const text =
                typeof source.parameters?.[PARAM_TEXT] === 'string'
                    ? source.parameters[PARAM_TEXT]
                    : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            entries.push({
                text,
                source: {
                    scope: source.scope,
                    field: PARAM_TEXT,
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
            typeof Window_EquipItem === 'undefined' ||
            !Window_EquipItem.prototype ||
            typeof Window_EquipItem.prototype.drawItem !== 'function'
        ) {
            return false;
        }

        if (Window_EquipItem.prototype.__CHEAT_MPP_REMOVO_EQUIP_TEXT_DRAW_ITEM_PATCHED__) {
            return true;
        }

        const originalDrawItem = Window_EquipItem.prototype.drawItem;
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const getConfiguredText = this._resolveConfiguredText.bind(this);
        const getConfiguredTextX = this._resolveConfiguredTextX.bind(this);
        const getConfiguredTextEnabled = this._resolveConfiguredTextEnabled.bind(this);

        Window_EquipItem.prototype.drawItem = function (index) {
            const item = Array.isArray(this._data) ? this._data[index] : null;
            if (item || !this._actor || this._slotId < 0) {
                return originalDrawItem.call(this, index);
            }

            const originalText = getConfiguredText();
            if (!isUsableText(originalText)) {
                return originalDrawItem.call(this, index);
            }

            try {
                const runtime = getRuntime();
                if (!runtime || !isRuntimeTranslationActive(runtime)) {
                    return originalDrawItem.call(this, index);
                }

                const translatedText = resolveRuntimeTranslation(
                    originalText,
                    runtime,
                    CACHE_TYPE,
                    {
                        requireRuntimeTranslationActive: true,
                        missValue: originalText,
                    }
                );

                if (!isUsableText(translatedText) || translatedText === originalText) {
                    return originalDrawItem.call(this, index);
                }

                const rect = this.itemRect(index);
                rect.width -= this.textPadding();

                this.changePaintOpacity(getConfiguredTextEnabled());
                const tx = getConfiguredTextX();
                this.drawText(translatedText, rect.x + tx, rect.y, rect.width - tx);
                this.changePaintOpacity(true);
                return;
            } catch (error) {
                console.warn(
                    '[MppRemovoEquipTextTranslator] Failed to apply runtime remove-equip text translation',
                    error
                );
                return originalDrawItem.call(this, index);
            }
        };

        Object.defineProperty(
            Window_EquipItem.prototype,
            '__CHEAT_MPP_REMOVO_EQUIP_TEXT_DRAW_ITEM_PATCHED__',
            {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            }
        );

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

    _resolveConfiguredText() {
        for (const source of this._resolveParameterSources()) {
            const value = source.parameters?.[PARAM_TEXT];
            if (typeof value === 'string') {
                return value;
            }
        }

        return '';
    }

    _resolveConfiguredTextX() {
        for (const source of this._resolveParameterSources()) {
            const raw = source.parameters?.[PARAM_TEXT_X];
            const number = Number(raw);
            if (Number.isFinite(number)) {
                return number;
            }
        }

        return 6;
    }

    _resolveConfiguredTextEnabled() {
        for (const source of this._resolveParameterSources()) {
            const raw = String(source.parameters?.[PARAM_TEXT_ENABLED] || '')
                .trim()
                .toLowerCase();
            if (!raw) {
                continue;
            }

            if (raw === 'false' || raw === '0') {
                return false;
            }

            if (raw === 'true' || raw === '1') {
                return true;
            }
        }

        return true;
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
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
                id: `mpp_removo_equip_text_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
