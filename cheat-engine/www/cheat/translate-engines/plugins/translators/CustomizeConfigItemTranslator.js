import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * CustomizeConfigItem.js translator
 *
 * Supported plugin:
 * - CustomizeConfigItem.js v3.3.0 (MZ)
 *
 * Notes:
 * - Collects custom option labels (Name) and mirrors them into the core `command` cache.
 * - Collects switch display values (OnText/OffText) and string option values (StringItems)
 *   into a dedicated plugin cache.
 * - Applies runtime translation at options draw-time:
 *   - Option labels via Window_Options.commandName
 *   - Switch/string status values via Window_Options.statusText
 */
export class CustomizeConfigItemTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'CustomizeConfigItem';
    }

    getPluginLabel() {
        return 'CustomizeConfigItem';
    }

    getCacheType() {
        return 'plugin_customize_config_item';
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = String(this.getPluginName() || '')
            .trim()
            .toLowerCase();
        if (!pluginName) {
            return null;
        }

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === pluginName;
            }) || null
        );
    }

    getRuntimeParameters() {
        if (window.PluginManager && typeof PluginManager.parameters === 'function') {
            return PluginManager.parameters(this.getPluginName()) || null;
        }

        return null;
    }

    parseStructArray(rawValue) {
        const result = [];
        const parsedArray = parseJsonSafely(rawValue, []);
        if (!Array.isArray(parsedArray)) {
            return result;
        }

        for (const entry of parsedArray) {
            if (typeof entry === 'string') {
                const parsedEntry = parseJsonSafely(entry, null);
                if (parsedEntry && typeof parsedEntry === 'object' && !Array.isArray(parsedEntry)) {
                    result.push(parsedEntry);
                }
                continue;
            }

            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                result.push(entry);
            }
        }

        return result;
    }

    parseStringItems(rawStringItems) {
        const parsed = parseJsonSafely(rawStringItems, []);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.map((item) => String(item ?? '')).filter((item) => this.isUsableText(item));
    }

    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        const numberOptions = this.parseStructArray(parameters.NumberOptions);
        const stringOptions = this.parseStructArray(parameters.StringOptions);
        const switchOptions = this.parseStructArray(parameters.SwitchOptions);
        const volumeOptions = this.parseStructArray(parameters.VolumeOptions);

        const appendNameEntries = (options, group) => {
            for (let optionIndex = 0; optionIndex < options.length; optionIndex++) {
                const option = options[optionIndex];
                const name = option && typeof option.Name === 'string' ? option.Name : '';
                if (!this.isUsableText(name)) {
                    continue;
                }

                output.push({
                    text: name,
                    cacheType: 'command',
                    source: {
                        scope,
                        group,
                        optionIndex,
                        field: 'Name',
                        mirrorType: 'command',
                    },
                });
            }
        };

        appendNameEntries(numberOptions, 'NumberOptions');
        appendNameEntries(stringOptions, 'StringOptions');
        appendNameEntries(switchOptions, 'SwitchOptions');
        appendNameEntries(volumeOptions, 'VolumeOptions');

        for (let optionIndex = 0; optionIndex < stringOptions.length; optionIndex++) {
            const option = stringOptions[optionIndex];
            const stringItems = this.parseStringItems(option?.StringItems);
            for (let valueIndex = 0; valueIndex < stringItems.length; valueIndex++) {
                const valueText = stringItems[valueIndex];
                output.push({
                    text: valueText,
                    cacheType: this.getCacheType(),
                    source: {
                        scope,
                        group: 'StringOptions',
                        optionIndex,
                        valueIndex,
                        field: 'StringItems',
                    },
                });
            }
        }

        for (let optionIndex = 0; optionIndex < switchOptions.length; optionIndex++) {
            const option = switchOptions[optionIndex];
            const onText = option && typeof option.OnText === 'string' ? option.OnText : '';
            const offText = option && typeof option.OffText === 'string' ? option.OffText : '';

            if (this.isUsableText(onText)) {
                output.push({
                    text: onText,
                    cacheType: this.getCacheType(),
                    source: {
                        scope,
                        group: 'SwitchOptions',
                        optionIndex,
                        field: 'OnText',
                    },
                });
            }

            if (this.isUsableText(offText)) {
                output.push({
                    text: offText,
                    cacheType: this.getCacheType(),
                    source: {
                        scope,
                        group: 'SwitchOptions',
                        optionIndex,
                        field: 'OffText',
                    },
                });
            }
        }
    }

    findRuntimeCustomOption(symbol) {
        if (!window.ConfigManager || typeof ConfigManager.getCustomParams !== 'function') {
            return null;
        }

        const customParams = ConfigManager.getCustomParams();
        if (!customParams || typeof customParams !== 'object') {
            return null;
        }

        return customParams[symbol] || null;
    }

    isCustomizeConfigValueSymbol(symbol) {
        return /^Boolean\d+$/.test(symbol) || /^String\d+$/.test(symbol);
    }

    resolveRuntimeTranslation(text, runtime, cacheType) {
        if (!this.isUsableText(text)) {
            return text;
        }

        if (!runtime) {
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, cacheType);
        runtime.trackCacheKeyUsage(cacheKey);

        if (!this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return this.isUsableText(cached) ? cached : text;
    }

    enablePluginTranslation() {
        if (!window.Window_Options || !Window_Options.prototype) {
            return;
        }

        const findRuntimeCustomOption = this.findRuntimeCustomOption.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const getRuntime = this.getRuntime.bind(this);
        const isCustomizeConfigValueSymbol = this.isCustomizeConfigValueSymbol.bind(this);
        const getCacheType = this.getCacheType.bind(this);

        if (typeof Window_Options.prototype.commandName === 'function') {
            const originalCommandName = Window_Options.prototype.commandName;

            Window_Options.prototype.commandName = function (index) {
                const name = originalCommandName.call(this, index);

                try {
                    const symbol = this.commandSymbol(index);
                    const customOption = findRuntimeCustomOption(symbol);
                    if (!customOption) {
                        return name;
                    }

                    const runtime = getRuntime();
                    const resolvedTranslation = resolveRuntimeTranslation(name, runtime, 'command');
                    if (resolvedTranslation !== name) {
                        customOption._translationApplied = true;
                    }

                    return resolvedTranslation;
                } catch (error) {
                    console.warn(
                        '[CustomizeConfigItemTranslator] Failed to translate option label',
                        error
                    );
                    return name;
                }
            };
        }

        if (typeof Window_Options.prototype.statusText === 'function') {
            const originalStatusText = Window_Options.prototype.statusText;

            Window_Options.prototype.statusText = function (index) {
                const status = originalStatusText.call(this, index);

                try {
                    const symbol = this.commandSymbol(index);
                    if (!isCustomizeConfigValueSymbol(symbol)) {
                        return status;
                    }

                    const customOption = findRuntimeCustomOption(symbol);
                    if (!customOption) {
                        return status;
                    }

                    const runtime = getRuntime();
                    return resolveRuntimeTranslation(status, runtime, getCacheType());
                } catch (error) {
                    console.warn(
                        '[CustomizeConfigItemTranslator] Failed to translate option value text',
                        error
                    );
                    return status;
                }
            };
        }
    }

    async prepareTranslator() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve()
            .then(() => this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[CustomizeConfigItemTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters && typeof runtimeParameters === 'object') {
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
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheType = this.isUsableText(entry.cacheType)
                ? entry.cacheType
                : this.getCacheType();
            const cacheKey = runtime.getCacheKey(text, cacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_customize_config_item_${cacheType}_${byCacheKey.size}`,
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

    countPluginAmountSync({ runtime }) {
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
