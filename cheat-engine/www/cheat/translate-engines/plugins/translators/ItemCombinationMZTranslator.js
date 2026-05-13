import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * ItemCombinationMZ translator
 *
 * Plugin: ItemCombinationMZ.js
 * Supported versions:
 * - v1.0.0 (MZ): base crafting scene and recipe flow.
 * - v1.1.0 (MZ): direct scene call command.
 * - v1.2.0 (MZ): bulk crafting flow.
 *
 * Notes:
 * - UI labels are sourced from plugin parameters and scanned as plugin cache entries.
 * - Runtime fix reverse-resolves translated recipe names back to original item names
 *   using item_name cache values, preventing recipe lookup failures in crafting scene.
 */

const CACHE_TYPE = 'plugin_item_combination_mz';
const ITEM_NAME_CACHE_TYPE = 'item_name';

const TEXT_PARAMETER_KEYS = [
    'commandName',
    'requiredItemText',
    'combineText',
    'failureText',
    'requiredToolText',
    'possessionPrefixText',
    'trackedPossessionSuffixStart',
    'trackedPossessionSuffixEnd',
    'bulkCraftPlusButtonText',
    'bulkCraftMinusButtonText',
    'bulkCraftAmountText',
];

function normalizeText(value) {
    return String(value || '').trim();
}

export class ItemCombinationMZTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'ItemCombinationMZ';
    }

    getPluginLabel() {
        return 'ItemCombinationMZ';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getPluginEntry() {
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

    buildTextEntriesFromParameters(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return [];
        }

        const entries = [];
        for (const key of TEXT_PARAMETER_KEYS) {
            const text = parameters[key];
            if (!this.isUsableText(text)) {
                continue;
            }

            entries.push({
                type: CACHE_TYPE,
                key,
                text,
            });
        }

        return entries;
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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[ItemCombinationMZTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const plugin = this.getPluginEntry();
        const parameters = plugin?.parameters || null;
        return this.buildTextEntriesFromParameters(parameters);
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
                id: `plugin_item_combination_mz_${byCacheKey.size}`,
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

    buildTranslatedItemNameToOriginalMap(runtime) {
        const translatedToOriginal = new Map();

        if (!(runtime.translationCache instanceof Map)) {
            return translatedToOriginal;
        }

        const sourceLang = normalizeText(runtime.sourceLang);
        const targetLang = normalizeText(runtime.targetLang);
        if (!sourceLang || !targetLang) {
            return translatedToOriginal;
        }

        const prefix = `${ITEM_NAME_CACHE_TYPE}:${sourceLang}-${targetLang}-`;
        for (const [cacheKey, value] of runtime.translationCache.entries()) {
            if (typeof cacheKey !== 'string' || !cacheKey.startsWith(prefix)) {
                continue;
            }

            const translated = normalizeText(value);
            if (!translated || translatedToOriginal.has(translated)) {
                continue;
            }

            const original = normalizeText(cacheKey.slice(prefix.length));
            if (!original) {
                continue;
            }

            translatedToOriginal.set(translated, original);
        }

        return translatedToOriginal;
    }

    resolveOriginalRecipeKeyName(recipeKeyName, runtime) {
        const normalized = normalizeText(recipeKeyName);
        if (!normalized) {
            return recipeKeyName;
        }

        const recipes = window.$gameParty?._craftingRecipes;
        if (!recipes || typeof recipes !== 'object') {
            return recipeKeyName;
        }
        const recipeKeys = Object.keys(recipes);

        if (recipeKeys.includes(normalized)) {
            return normalized;
        }

        const translatedToOriginal = this.buildTranslatedItemNameToOriginalMap(runtime);
        const original = translatedToOriginal.get(normalized);
        if (!original || !recipeKeys.includes(original)) {
            return recipeKeyName;
        }

        const cacheKey = runtime.getCacheKey(original, ITEM_NAME_CACHE_TYPE);
        runtime.trackCacheKeyUsage(cacheKey);

        return original;
    }

    translateItemCombinationSceneText(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, this.getCacheType());
        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return this.isUsableText(cached) ? cached : text;
    }

    enablePluginTranslation() {
        const sceneCtor = window['Scene_CraftingMenu'];
        if (!sceneCtor?.prototype) {
            return;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveOriginalRecipeKeyName = this.resolveOriginalRecipeKeyName.bind(this);
        const translateItemCombinationSceneText = this.translateItemCombinationSceneText.bind(this);

        if (typeof sceneCtor.prototype.currentRecipeSymbol === 'function') {
            const originalCurrentRecipeSymbol = sceneCtor.prototype.currentRecipeSymbol;

            sceneCtor.prototype.currentRecipeSymbol = function () {
                const result = originalCurrentRecipeSymbol.apply(this, arguments);
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return result;
                }

                return resolveOriginalRecipeKeyName(result, runtime);
            };
        }

        if (window.Window_Base?.prototype && typeof Window_Base.prototype.drawText === 'function') {
            const originalDrawText = Window_Base.prototype.drawText;

            Window_Base.prototype.drawText = function () {
                const runtime = getRuntime();
                const isCraftingScene = window.SceneManager?._scene instanceof sceneCtor;

                if (isCraftingScene && isRuntimeTranslationActive(runtime) && arguments.length > 0) {
                    arguments[0] = translateItemCombinationSceneText(arguments[0], runtime);
                }

                return originalDrawText.apply(this, arguments);
            };
        }
    }
}
