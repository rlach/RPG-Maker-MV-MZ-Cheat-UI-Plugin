import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * YKP_ItemComposition translator
 *
 * Plugin: YKP_ItemComposition.js
 * Supported versions:
 * - v1.0.0-v1.1.1 (MZ): item composition / upgrade scene labels and prompts.
 *
 * Notes:
 * - Most visible text comes from plugin parameters, including category names,
 *   help subtexts, confirm prompts, and the custom currency unit.
 * - A small number of labels are hardcoded in the plugin runtime
 *   (for example the main composition tab and owned-count label).
 * - Runtime translation is applied at the menu-command insertion point and in
 *   Scene_ItemComposition window text rendering, while preserving command symbols.
 */

const CACHE_TYPE = 'plugin_ykp_item_composition';
const SCENE_NAME = 'Scene_ItemComposition';

const SIMPLE_PARAMETER_FIELDS = Object.freeze([
    'menuListName',
    'moneyUnit',
    'compositionHelpSubText',
    'compositionViewGoldName',
    'compositionSuccessText',
    'upgradeHelpSubText',
    'upgradeSelectText',
    'upgradeSelectItemName',
    'upgradeViewGoldName',
    'upgradeSuccessText',
]);

const STRUCT_ARRAY_FIELDS = Object.freeze([
    {
        field: 'compositionCategory',
        textKey: 'categoryName',
    },
    {
        field: 'upgradeCategory',
        textKey: 'categoryName',
    },
    {
        field: 'upgradeParamData',
        textKey: 'name',
    },
]);

const HARDCODED_TEXTS = Object.freeze(['ものづくり', '強化する', '(所持:']);

function normalizeText(value) {
    return String(value || '').trim();
}

function isSceneActiveByName(sceneName) {
    const activeScene = window.SceneManager?._scene;
    const activeName = activeScene?.constructor?.name;
    return typeof activeName === 'string' && activeName === sceneName;
}

export class YkpItemCompositionTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownSourceTexts = null;
    }

    getPluginName() {
        return 'YKP_ItemComposition';
    }

    getPluginLabel() {
        return 'YKP ItemComposition';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = normalizeText(this.getPluginName()).toLowerCase();
        return (
            window.$plugins.find((plugin) => {
                const name = normalizeText(plugin?.name).toLowerCase();
                return !!name && name === pluginName;
            }) || null
        );
    }

    getRuntimeParameters() {
        const pluginManager = window.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        return parameters && typeof parameters === 'object' ? parameters : null;
    }

    parseStructArray(rawValue) {
        const parsedArray = parseJsonSafely(rawValue, []);
        if (!Array.isArray(parsedArray)) {
            return [];
        }

        return parsedArray
            .map((entry) => parseJsonSafely(entry, null))
            .filter((entry) => entry && typeof entry === 'object');
    }

    appendParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const field of SIMPLE_PARAMETER_FIELDS) {
            const text = parameters[field];
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

        for (const config of STRUCT_ARRAY_FIELDS) {
            const items = this.parseStructArray(parameters[config.field]);
            for (let index = 0; index < items.length; index++) {
                const item = items[index];
                const text = item?.[config.textKey];
                if (!this.isUsableText(text)) {
                    continue;
                }

                output.push({
                    text,
                    source: {
                        scope,
                        field: config.field,
                        textKey: config.textKey,
                        index,
                    },
                });
            }
        }
    }

    appendHardcodedEntries(output) {
        for (const text of HARDCODED_TEXTS) {
            output.push({
                text,
                source: {
                    scope: 'runtimeHardcoded',
                },
            });
        }
    }

    getKnownSourceTexts() {
        if (this._knownSourceTexts instanceof Set) {
            return this._knownSourceTexts;
        }

        const entries = [];
        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.appendParameterEntries(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.appendParameterEntries(runtimeParameters, 'runtimePluginManagerParameter', entries);
        }

        this.appendHardcodedEntries(entries);

        const knownSourceTexts = new Set();
        for (const entry of entries) {
            const text = normalizeText(entry?.text);
            if (text) {
                knownSourceTexts.add(text);
            }
        }

        this._knownSourceTexts = knownSourceTexts;
        return knownSourceTexts;
    }

    shouldTranslateKnownText(text) {
        if (!this.isUsableText(text)) {
            return false;
        }

        return this.getKnownSourceTexts().has(String(text).trim());
    }

    translateKnownText(text, runtime) {
        if (!this.shouldTranslateKnownText(text)) {
            return text;
        }

        return this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
        });
    }

    translateHelpText(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceText = String(text);
        const directTranslation = this.translateKnownText(sourceText, runtime);
        if (directTranslation !== sourceText) {
            return directTranslation;
        }

        for (const prefix of this.getKnownSourceTexts()) {
            if (!sourceText.startsWith(prefix) || sourceText === prefix) {
                continue;
            }

            const translatedPrefix = this.resolveRuntimeTranslation(prefix, runtime, this.getCacheType(), {
                requireRuntimeTranslationActive: true,
            });

            if (translatedPrefix !== prefix) {
                return translatedPrefix + sourceText.slice(prefix.length);
            }
        }

        return sourceText;
    }

    enablePluginTranslation() {
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateKnownText = this.translateKnownText.bind(this);
        const translateHelpText = this.translateHelpText.bind(this);

        if (window.Window_MenuCommand?.prototype) {
            const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;

            Window_MenuCommand.prototype.addOriginalCommands = function () {
                const result = originalAddOriginalCommands.apply(this, arguments);

                try {
                    const runtime = getRuntime();
                    if (!isRuntimeTranslationActive(runtime) || !Array.isArray(this._list)) {
                        return result;
                    }

                    for (const entry of this._list) {
                        if (entry?.symbol !== 'itemComposition') {
                            continue;
                        }

                        entry.name = translateKnownText(entry.name, runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[YkpItemCompositionTranslator] Failed to translate menu command label',
                        error
                    );
                }

                return result;
            };
        }

        if (window.Window_Base?.prototype && typeof Window_Base.prototype.drawText === 'function') {
            const originalDrawText = Window_Base.prototype.drawText;

            Window_Base.prototype.drawText = function () {
                try {
                    const runtime = getRuntime();
                    if (
                        isRuntimeTranslationActive(runtime) &&
                        isSceneActiveByName(SCENE_NAME) &&
                        arguments.length > 0
                    ) {
                        arguments[0] = translateKnownText(arguments[0], runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[YkpItemCompositionTranslator] Failed to translate scene text',
                        error
                    );
                }

                return originalDrawText.apply(this, arguments);
            };
        }

        if (window.Window_Help?.prototype && typeof Window_Help.prototype.setText === 'function') {
            const originalSetText = Window_Help.prototype.setText;

            Window_Help.prototype.setText = function (text) {
                try {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime) && isSceneActiveByName(SCENE_NAME)) {
                        arguments[0] = translateHelpText(text, runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[YkpItemCompositionTranslator] Failed to translate help text',
                        error
                    );
                }

                return originalSetText.apply(this, arguments);
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

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[YkpItemCompositionTranslator] Scan failed', error);
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
            this.appendParameterEntries(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.appendParameterEntries(runtimeParameters, 'runtimePluginManagerParameter', entries);
        }

        this.appendHardcodedEntries(entries);
        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_ykp_item_composition_${byCacheKey.size}`,
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