/**
 * Torigoya Achievement2 Addon: Category translator
 *
 * Supported plugin:
 * - TorigoyaMZ_Achievement2_AddonCategory v1.3.1 (MZ)
 *
 * Translation scope:
 * - Category names from plugin parameters/runtime category definitions.
 * - Runtime category command labels in Window_AchievementCategory.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const PLUGIN_NAME_ALIASES = [
    'TorigoyaMZ_Achievement2_AddonCategory',
    'Torigoya_Achievement2_AddonCategory',
];

export class TorigoyaAchievement2AddonCategoryTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'TorigoyaMZ_Achievement2_AddonCategory';
    }

    getPluginAliases() {
        return PLUGIN_NAME_ALIASES;
    }

    getPluginLabel() {
        return 'Torigoya Achievement2 Addon: Category';
    }

    getCacheType() {
        return 'plugin_torigoya_achievement2_addon_category';
    }

    parseCategoryStructArray(rawValue) {
        const parsed = parseJsonSafely(rawValue, []);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((entry) => parseJsonSafely(entry, entry))
            .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
    }

    appendCategoryNameEntry(output, category, source) {
        const categoryName = typeof category?.name === 'string' ? category.name : '';
        if (!this.isUsableText(categoryName)) {
            return;
        }

        output.push({
            text: categoryName,
            source,
        });
    }

    appendEntriesFromPluginParameters(parameters, output) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        const categories = this.parseCategoryStructArray(parameters.categories);
        for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
            this.appendCategoryNameEntry(output, categories[categoryIndex], {
                scope: 'pluginParameterCategory',
                categoryIndex,
            });
        }
    }

    appendEntriesFromRuntimeParameters(parameter, output) {
        if (!parameter || typeof parameter !== 'object') {
            return;
        }

        const categories = Array.isArray(parameter.categories) ? parameter.categories : [];
        for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
            this.appendCategoryNameEntry(output, categories[categoryIndex], {
                scope: 'runtimeCategory',
                categoryIndex,
            });
        }
    }

    enablePluginTranslation() {
        const categoryWindowClass =
            window.Torigoya?.Achievement2?.Addons?.Category?.Window_AchievementCategory;
        if (
            !categoryWindowClass?.prototype ||
            typeof categoryWindowClass.prototype.makeCommandList !== 'function'
        ) {
            return false;
        }

        if (categoryWindowClass.prototype.__CHEAT_TORIGOYA_ACHIEVEMENT2_ADDON_CATEGORY_PATCHED__) {
            return true;
        }

        const originalMakeCommandList = categoryWindowClass.prototype.makeCommandList;
        categoryWindowClass.prototype.makeCommandList = function () {
            const result = originalMakeCommandList.apply(this, arguments);
            const runtime =
                this?.constructor?.__CHEAT_TORIGOYA_ACHIEVEMENT2_ADDON_CATEGORY_TRANSLATOR__?.getRuntime();
            const translator =
                this?.constructor?.__CHEAT_TORIGOYA_ACHIEVEMENT2_ADDON_CATEGORY_TRANSLATOR__;
            if (
                !translator ||
                !runtime ||
                !translator.isRuntimeTranslationActive(runtime) ||
                !Array.isArray(this._list)
            ) {
                return result;
            }

            for (const command of this._list) {
                if (!command || !translator.isUsableText(command.name)) {
                    continue;
                }

                const translated = translator.resolveRuntimeTranslation(
                    command.name,
                    runtime,
                    translator.getCacheType(),
                    {
                        requireRuntimeTranslationActive: true,
                    }
                );

                if (translator.isUsableText(translated)) {
                    command.name = translated;
                }
            }

            return result;
        };

        categoryWindowClass.__CHEAT_TORIGOYA_ACHIEVEMENT2_ADDON_CATEGORY_TRANSLATOR__ = this;
        Object.defineProperty(
            categoryWindowClass.prototype,
            '__CHEAT_TORIGOYA_ACHIEVEMENT2_ADDON_CATEGORY_PATCHED__',
            {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            }
        );

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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[TorigoyaAchievement2AddonCategoryTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        const pluginEntry =
            this.findPluginEntry(this.getPluginName()) ||
            this.getPluginAliases()
                .map((name) => this.findPluginEntry(name))
                .find((entry) => !!entry);

        const pluginParameters =
            pluginEntry?.parameters && typeof pluginEntry.parameters === 'object'
                ? pluginEntry.parameters
                : null;

        if (pluginParameters) {
            this.appendEntriesFromPluginParameters(pluginParameters, entries);
        }

        if (entries.length <= 0) {
            this.appendEntriesFromRuntimeParameters(
                window.Torigoya?.Achievement2?.Addons?.Category?.parameter,
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

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_torigoya_achievement2_addon_category_${byCacheKey.size}`,
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
}
