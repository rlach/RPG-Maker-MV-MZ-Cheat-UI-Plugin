import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * AKUNOU_OptionMessageSpeed translator
 *
 * Supported plugin versions:
 * - AKUNOU_OptionMessageSpeed.js v1.01 (MV)
 *
 * Translation notes:
 * - Translatable text is stored in plugin parameters and in the message-speed
 *   option's displayed status labels.
 * - Runtime hook patches Window_Options so the command label and selected
 *   status text are translated when the options scene renders them.
 */

const PLUGIN_NAME = 'AKUNOU_OptionMessageSpeed';
const CACHE_TYPE = 'plugin_akunou_option_message_speed';
const PARAM_MESSAGE_SPEED_TERM = 'Message Speed Term';
const PARAM_MESSAGE_SPEED_LIST = 'Message Speed List';

export class AKUNOUOptionMessageSpeedTranslator extends BasePluginTranslator {
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
        return 'AKUNOU OptionMessageSpeed';
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
                console.warn('[AKUNOUOptionMessageSpeedTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        for (const source of this._resolveParameterSources()) {
            const term = source.parameters?.[PARAM_MESSAGE_SPEED_TERM];
            if (this.isUsableText(term)) {
                entries.push({
                    text: String(term),
                    source: {
                        scope: source.scope,
                        field: PARAM_MESSAGE_SPEED_TERM,
                    },
                });
            }

            const list = parseJsonSafely(source.parameters?.[PARAM_MESSAGE_SPEED_LIST], null);
            if (!list || typeof list !== 'object' || Array.isArray(list)) {
                continue;
            }

            for (const key of Object.keys(list)) {
                if (!this.isUsableText(key)) {
                    continue;
                }

                entries.push({
                    text: String(key),
                    source: {
                        scope: source.scope,
                        field: PARAM_MESSAGE_SPEED_LIST,
                        key,
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
        const optionsProto = window.Window_Options?.prototype;
        if (
            !optionsProto ||
            typeof optionsProto.addExtraOptions !== 'function' ||
            typeof optionsProto.keyStatusText !== 'function'
        ) {
            return false;
        }

        if (optionsProto.__CHEAT_AKUNOU_OPTION_MESSAGE_SPEED_PATCHED__) {
            return true;
        }

        const originalAddExtraOptions = optionsProto.addExtraOptions;
        const originalKeyStatusText = optionsProto.keyStatusText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();

        optionsProto.addExtraOptions = function () {
            const result = originalAddExtraOptions.apply(this, arguments);

            try {
                const runtime = getRuntime();
                const sourceText = this._aknouMessageSpeedCommandName;
                if (!runtime || !isUsableText(sourceText)) {
                    return result;
                }

                const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                runtime.trackCacheKeyUsage(cacheKey);
                if (!isRuntimeTranslationActive(runtime)) {
                    return result;
                }

                const translated = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                    requireRuntimeTranslationActive: true,
                    missValue: sourceText,
                });

                if (!isUsableText(translated) || !Array.isArray(this._list)) {
                    return result;
                }

                for (const entry of this._list) {
                    if (entry?.symbol === 'messageSpeedKey') {
                        entry.name = translated;
                        break;
                    }
                }
            } catch (error) {
                console.warn(
                    '[AKUNOUOptionMessageSpeedTranslator] Failed to translate command label',
                    error
                );
            }

            return result;
        };

        optionsProto.keyStatusText = function (symbol, value) {
            const result = originalKeyStatusText.call(this, symbol, value);
            if (symbol !== 'messageSpeedKey' || !isUsableText(result)) {
                return result;
            }

            try {
                const runtime = getRuntime();
                if (!runtime) {
                    return result;
                }

                const cacheKey = runtime.getCacheKey(result, cacheType);
                runtime.trackCacheKeyUsage(cacheKey);

                if (!isRuntimeTranslationActive(runtime)) {
                    return result;
                }

                const translated = resolveRuntimeTranslation(result, runtime, cacheType, {
                    requireRuntimeTranslationActive: true,
                    missValue: result,
                });

                return isUsableText(translated) ? translated : result;
            } catch (error) {
                console.warn(
                    '[AKUNOUOptionMessageSpeedTranslator] Failed to translate status text',
                    error
                );
                return result;
            }
        };

        Object.defineProperty(optionsProto, '__CHEAT_AKUNOU_OPTION_MESSAGE_SPEED_PATCHED__', {
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
                id: `plugin_akunou_option_message_speed_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
