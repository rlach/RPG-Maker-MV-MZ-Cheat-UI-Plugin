/**
 * SaiScenefileTranslator
 *
 * Translator for sai_Scenefile.js
 * Supported versions:
 * - MV custom save scene variant (plugin id: sai_Scenefile)
 *
 * Text sources:
 * - Plugin parameters Location TEXT / Gold TEXT.
 *
 * Runtime notes:
 * - Window_SavefileStatus is plugin-local, so runtime translation hooks gate on
 *   Window_Base.drawTextEx + constructor name check.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const LOCATION_TEXT_KEY = 'Location TEXT';
const GOLD_TEXT_KEY = 'Gold TEXT';
const LOCATION_TEXT_FALLBACK = '記録場所：';
const GOLD_TEXT_FALLBACK = '所持金　：';

export class SaiScenefileTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
    }

    getPluginName() {
        return 'sai_Scenefile';
    }

    getPluginLabel() {
        return 'sai_Scenefile';
    }

    getCacheType() {
        return 'plugin_sai_scenefile';
    }

    buildScanEntries() {
        const parameters = this._resolvePluginParameters();
        const locationText = String(parameters?.[LOCATION_TEXT_KEY] ?? LOCATION_TEXT_FALLBACK);
        const goldText = String(parameters?.[GOLD_TEXT_KEY] ?? GOLD_TEXT_FALLBACK);

        const entries = [];
        if (this.isUsableText(locationText)) {
            entries.push({
                text: locationText,
                source: { scope: 'pluginParam', paramKey: LOCATION_TEXT_KEY },
            });
        }

        if (this.isUsableText(goldText)) {
            entries.push({
                text: goldText,
                source: { scope: 'pluginParam', paramKey: GOLD_TEXT_KEY },
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
        const windowBaseProto = window.Window_Base?.prototype;
        if (!windowBaseProto || typeof windowBaseProto.drawTextEx !== 'function') {
            return false;
        }

        this._hookDrawTextEx(windowBaseProto);
        return true;
    }

    _hookDrawTextEx(prototype) {
        if (prototype.__CHEAT_SAI_SCENEFILE_DRAW_TEXT_EX_PATCHED__) {
            return;
        }

        const sourceSet = new Set(this.buildScanEntries().map((entry) => entry.text));
        const original = prototype.drawTextEx;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        prototype.drawTextEx = function (text, x, y) {
            const trimmed = typeof text === 'string' ? text.trimEnd() : text;
            if (this?.constructor?.name !== 'Window_SavefileStatus' || !sourceSet.has(trimmed)) {
                return original.call(this, text, x, y);
            }

            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, text, x, y);
            }

            const translated = resolveRuntimeTranslation(trimmed, runtime, 'plugin_sai_scenefile', {
                requireRuntimeTranslationActive: true,
                missValue: trimmed,
            });

            return original.call(this, translated, x, y);
        };

        Object.defineProperty(prototype, '__CHEAT_SAI_SCENEFILE_DRAW_TEXT_EX_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
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
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_sai_scenefile_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
