import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * TsumioBattleResult.js translator
 *
 * Supported plugin versions:
 * - 1.0.1 (MV)
 *
 * Translation notes:
 * - Collects translatable labels from plugin parameter DescSettings / 説明文の設定.
 * - Runtime hook observes text drawing in battle result windows created by the plugin:
 *   Window_ResultDesc, Window_ExpCalcArea, Window_ObtainedSkills, Window_ObtainedItems.
 * - Only displayed text payload is translated; plugin behavior and flow remain unchanged.
 */

const PLUGIN_NAME = 'TsumioBattleResult';
const CACHE_TYPE = 'plugin_tsumio_battle_result';
const DESC_SETTINGS_PARAM_KEYS = ['DescSettings', '説明文の設定'];
const DESC_FIELDS = ['expDesc', 'skillDesc', 'noSkillDesc', 'noItemDesc', 'itemDesc'];
const OBSERVED_WINDOW_NAMES = new Set([
    'Window_ResultDesc',
    'Window_ExpCalcArea',
    'Window_ObtainedSkills',
    'Window_ObtainedItems',
]);
const WINDOW_BASE_HOOK_FLAG = '__CHEAT_TSUMIO_BATTLE_RESULT_TRANSLATOR_HOOKED__';

function getConstructorName(instance) {
    return String(instance?.constructor?.name || '');
}

export class TsumioBattleResultTranslator extends BasePluginTranslator {
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
        return 'TsumioBattleResult';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getDescSettingsFromParameters(parameters) {
        for (const key of DESC_SETTINGS_PARAM_KEYS) {
            const parsed = parseJsonSafely(parameters?.[key], null);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }

        return null;
    }

    appendDescSettingEntries(descSettings, source, output) {
        if (!descSettings || typeof descSettings !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const field of DESC_FIELDS) {
            const text = String(descSettings[field] || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope: source,
                    field,
                },
            });
        }
    }

    buildScanEntries() {
        const entries = [];
        const pluginEntry = this.findPluginEntry(this.getPluginName());

        if (pluginEntry?.parameters) {
            this.appendDescSettingEntries(
                this.getDescSettingsFromParameters(pluginEntry.parameters),
                'pluginEntryParameter',
                entries
            );
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const runtimeParameters = window.PluginManager.parameters(this.getPluginName());
            this.appendDescSettingEntries(
                this.getDescSettingsFromParameters(runtimeParameters),
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
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
                console.warn('[TsumioBattleResultTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_tsumio_battle_result_${byCacheKey.size}`,
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

    shouldObserveWindow(windowInstance) {
        return OBSERVED_WINDOW_NAMES.has(getConstructorName(windowInstance));
    }

    translateObservedText(text, runtime) {
        if (!this.isUsableText(text) || !runtime) {
            return text;
        }

        if (!this.isRuntimeTranslationActive(runtime)) {
            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            runtime.trackCacheKeyUsage(cacheKey);
            return text;
        }

        return this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: text,
        });
    }

    enablePluginTranslation() {
        if (
            typeof Window_Base === 'undefined' ||
            !Window_Base.prototype ||
            typeof Window_Base.prototype.drawText !== 'function' ||
            typeof Window_Base.prototype.drawTextEx !== 'function'
        ) {
            return false;
        }

        if (Window_Base.prototype[WINDOW_BASE_HOOK_FLAG]) {
            return true;
        }

        const originalDrawText = Window_Base.prototype.drawText;
        const originalDrawTextEx = Window_Base.prototype.drawTextEx;
        const getRuntime = this.getRuntime.bind(this);
        const shouldObserveWindow = this.shouldObserveWindow.bind(this);
        const translateObservedText = this.translateObservedText.bind(this);

        Window_Base.prototype.drawText = function (text, x, y, maxWidth, align) {
            let nextText = text;

            try {
                const runtime = getRuntime();
                if (runtime && shouldObserveWindow(this) && typeof text === 'string') {
                    nextText = translateObservedText(text, runtime);
                }
            } catch (error) {
                console.warn(
                    '[TsumioBattleResultTranslator] Failed runtime translation in drawText',
                    error
                );
            }

            return originalDrawText.call(this, nextText, x, y, maxWidth, align);
        };

        Window_Base.prototype.drawTextEx = function (text, x, y, width) {
            let nextText = text;

            try {
                const runtime = getRuntime();
                if (runtime && shouldObserveWindow(this) && typeof text === 'string') {
                    nextText = translateObservedText(text, runtime);
                }
            } catch (error) {
                console.warn(
                    '[TsumioBattleResultTranslator] Failed runtime translation in drawTextEx',
                    error
                );
            }

            return originalDrawTextEx.call(this, nextText, x, y, width);
        };

        Window_Base.prototype[WINDOW_BASE_HOOK_FLAG] = true;
        return true;
    }
}
