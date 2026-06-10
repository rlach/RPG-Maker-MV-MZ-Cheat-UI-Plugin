import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * EquipScene_Extension translator
 *
 * Supported plugin versions:
 * - EquipScene_Extension.js v1.4.2 (MZ)
 *
 * Translation notes:
 * - The only visible plugin-authored text we translate is `RemoveEquipText`.
 * - Runtime hook patches Window_EquipItem.drawItem and translates the empty-slot
 *   label while preserving the rest of the equipment window behavior.
 */

const PLUGIN_NAME = 'EquipScene_Extension';
const CACHE_TYPE = 'plugin_equip_scene_extension';
const PARAM_REMOVE_EQUIP_TEXT = 'RemoveEquipText';
const HOOK_FLAG = '__CHEAT_EQUIP_SCENE_EXTENSION_PATCHED__';

export class EquipSceneExtensionTranslator extends BasePluginTranslator {
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
        return 'EquipScene Extension';
    }

    getCacheType() {
        return CACHE_TYPE;
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
                console.warn('[EquipSceneExtensionTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        for (const source of this._resolveParameterSources()) {
            const text = source.parameters?.[PARAM_REMOVE_EQUIP_TEXT];
            if (!this.isUsableText(text)) {
                continue;
            }

            entries.push({
                text: String(text),
                source: {
                    scope: source.scope,
                    field: PARAM_REMOVE_EQUIP_TEXT,
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
        const equipItemProto = window.Window_EquipItem?.prototype;
        if (!equipItemProto || typeof equipItemProto.drawItem !== 'function') {
            return false;
        }

        if (equipItemProto[HOOK_FLAG]) {
            return true;
        }

        const originalDrawItem = equipItemProto.drawItem;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const getRemoveText = this._resolveRemoveEquipText.bind(this);
        const cacheType = this.getCacheType();

        equipItemProto.drawItem = function (index) {
            const originalText = getRemoveText();
            if (!isUsableText(originalText)) {
                return originalDrawItem.apply(this, arguments);
            }

            const runtime = getRuntime();
            if (!runtime || !isRuntimeTranslationActive(runtime)) {
                return originalDrawItem.apply(this, arguments);
            }

            const originalDrawText = this.drawText;
            let translatedFirstText = false;

            this.drawText = function (text, x, y, maxWidth, align) {
                let nextText = text;

                if (!translatedFirstText && typeof text === 'string' && text === originalText) {
                    const cacheKey = runtime.getCacheKey(text, cacheType);
                    runtime.trackCacheKeyUsage(cacheKey);
                    const translated = resolveRuntimeTranslation(text, runtime, cacheType, {
                        requireRuntimeTranslationActive: true,
                        missValue: text,
                    });
                    if (isUsableText(translated)) {
                        nextText = translated;
                    }
                    translatedFirstText = true;
                }

                return originalDrawText.call(this, nextText, x, y, maxWidth, align);
            };

            try {
                return originalDrawItem.apply(this, arguments);
            } catch (error) {
                console.warn(
                    '[EquipSceneExtensionTranslator] Failed to translate empty equip label',
                    error
                );
                return originalDrawItem.apply(this, arguments);
            } finally {
                this.drawText = originalDrawText;
            }
        };

        Object.defineProperty(equipItemProto, HOOK_FLAG, {
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
            sources.push({ scope: 'pluginEntryParameter', parameters: pluginEntry.parameters });
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

    _resolveRemoveEquipText() {
        for (const source of this._resolveParameterSources()) {
            const value = source.parameters?.[PARAM_REMOVE_EQUIP_TEXT];
            if (this.isUsableText(value)) {
                return String(value);
            }
        }

        return '';
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
                id: `plugin_equip_scene_extension_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
