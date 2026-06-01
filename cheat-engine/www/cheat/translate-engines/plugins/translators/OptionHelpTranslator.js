import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * OptionHelp translator
 *
 * Plugin: OptionHelp.js
 * Supported plugin versions:
 * - v1.1.0 (MZ)
 *
 * Translation notes:
 * - Source text is stored in plugin parameter `helpList` as struct array entries
 *   (`symbol`, `description`).
 * - Runtime hook patches options help refresh and only translates the description
 *   payload; option symbols/command tokens remain untouched.
 */

const PLUGIN_NAME = 'OptionHelp';
const CACHE_TYPE = 'plugin_option_help';
const HOOK_FLAG = '__CHEAT_OPTION_HELP_PATCHED__';

export class OptionHelpTranslator extends BasePluginTranslator {
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
        return 'OptionHelp';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getRuntimeParameters() {
        const pluginManager = window.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        return parameters && typeof parameters === 'object' ? parameters : null;
    }

    parseHelpList(rawHelpList) {
        const parsed = parseJsonSafely(rawHelpList, []);
        if (!Array.isArray(parsed)) {
            return [];
        }

        const result = [];
        for (let index = 0; index < parsed.length; index++) {
            const entry = parseJsonSafely(parsed[index], null);
            if (!entry || typeof entry !== 'object') {
                continue;
            }

            const symbol = typeof entry.symbol === 'string' ? entry.symbol : '';
            const description = typeof entry.description === 'string' ? entry.description : '';
            if (!this.isUsableText(description)) {
                continue;
            }

            result.push({ symbol, description, index });
        }

        return result;
    }

    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        const helpList = this.parseHelpList(parameters.helpList);
        for (const item of helpList) {
            output.push({
                text: item.description,
                source: {
                    scope,
                    symbol: item.symbol,
                    index: item.index,
                },
            });
        }
    }

    buildRuntimeHelpMap() {
        const bySymbol = new Map();
        const pushItems = (parameters) => {
            const list = this.parseHelpList(parameters?.helpList);
            for (const item of list) {
                if (!this.isUsableText(item.symbol) || !this.isUsableText(item.description)) {
                    continue;
                }

                bySymbol.set(item.symbol, item.description);
            }
        };

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            pushItems(pluginEntry.parameters);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            pushItems(runtimeParameters);
        }

        return bySymbol;
    }

    enablePluginTranslation() {
        const optionsProto = window.Window_Options?.prototype;
        if (!optionsProto || typeof optionsProto.updateHelp !== 'function') {
            return false;
        }

        if (optionsProto[HOOK_FLAG]) {
            return true;
        }

        const originalUpdateHelp = optionsProto.updateHelp;
        const buildRuntimeHelpMap = this.buildRuntimeHelpMap.bind(this);
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        optionsProto.updateHelp = function () {
            originalUpdateHelp.apply(this, arguments);

            try {
                const runtime = getRuntime();
                if (!runtime || !isRuntimeTranslationActive(runtime)) {
                    return;
                }

                const symbol = this.commandSymbol(this.index());
                const helpMap = buildRuntimeHelpMap();
                const sourceDescription = helpMap.get(symbol);
                if (!isUsableText(sourceDescription)) {
                    return;
                }

                const translated = resolveRuntimeTranslation(sourceDescription, runtime, CACHE_TYPE, {
                    requireRuntimeTranslationActive: true,
                    missValue: sourceDescription,
                });

                this._helpWindow.setText(translated);
            } catch (error) {
                console.warn('[OptionHelpTranslator] Failed to translate option help text', error);
            }
        };

        Object.defineProperty(optionsProto, HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

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
                console.warn('[OptionHelpTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.appendEntriesFromParameters(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    buildUniquePendingItems(runtime) {
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
                id: `plugin_option_help_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
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