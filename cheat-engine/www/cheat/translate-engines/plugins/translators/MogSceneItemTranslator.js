import { BasePluginTranslator } from '../BasePluginTranslator.js';

/*
 * MOG_SceneItem.js
 * Supported versions:
 * - v1.1 (MV)
 *
 * Notes:
 * - This plugin introduces Window_ItemListM and custom item scene behavior.
 * - Item/database translation is handled by base translation phases.
 * - Runtime integration here focuses on UI display safety:
 *   1) draw translated item names/descriptions from cache without mutating source data,
 *   2) guard item usability checks in Window_ItemListM.isEnabled to prevent
 *      third-party condition plugins from crashing item scene rendering.
 */

const CACHE_TYPE = 'plugin_mog_scene_item';
const ITEM_NAME_CACHE_TYPE = 'item_name';
const ITEM_DESCRIPTION_CACHE_TYPE = 'item_description';
const COMMAND_CACHE_TYPE = 'command';

function cloneItemWithUiText(item, translatedName, translatedDescription) {
    if (!item || typeof item !== 'object') {
        return item;
    }

    let changed = false;
    const nextItem = { ...item };

    if (typeof translatedName === 'string' && translatedName !== item.name) {
        nextItem.name = translatedName;
        changed = true;
    }

    if (typeof translatedDescription === 'string' && translatedDescription !== item.description) {
        nextItem.description = translatedDescription;
        changed = true;
    }

    return changed ? nextItem : item;
}

export class MogSceneItemTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MOG_SceneItem';
    }

    getPluginLabel() {
        return 'MOG SceneItem';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    async precomputeCounts() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    resolveUiTextFromCache(text, cacheType, runtime, options = {}) {
        if (!this.isUsableText(text)) {
            return text;
        }

        if (options.requireRuntimeTranslationActive && !this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, cacheType);
        console.log(`[MogSceneItemTranslator] Resolving UI text from cache with key: ${cacheKey}`);
        if (!cacheKey?.startsWith('item_')) {
            runtime.trackCacheKeyUsage(cacheKey);
        }

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return this.isUsableText(cached) ? cached : text;
    }

    buildTranslatedUiItem(item, runtime) {
        if (!item || typeof item !== 'object') {
            return item;
        }

        const translatedName = this.resolveUiTextFromCache(
            item.name,
            ITEM_NAME_CACHE_TYPE,
            runtime
        );
        const translatedDescription = this.resolveUiTextFromCache(
            item.description,
            ITEM_DESCRIPTION_CACHE_TYPE,
            runtime
        );

        return cloneItemWithUiText(item, translatedName, translatedDescription);
    }

    resolveTranslatedCommandName(name, runtime) {
        return this.resolveUiTextFromCache(name, COMMAND_CACHE_TYPE, runtime, {
            requireRuntimeTranslationActive: true,
        });
    }

    enablePluginTranslation() {
        const itemListCtor = window.Window_ItemListM;
        if (!itemListCtor?.prototype) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const buildTranslatedUiItem = this.buildTranslatedUiItem.bind(this);
        const resolveTranslatedCommandName = this.resolveTranslatedCommandName.bind(this);

        const itemCategoryCtor = window.Window_ItemCategory;
        if (
            itemCategoryCtor?.prototype &&
            typeof itemCategoryCtor.prototype.commandName === 'function'
        ) {
            const originalCommandName = itemCategoryCtor.prototype.commandName;

            itemCategoryCtor.prototype.commandName = function (index) {
                const name = originalCommandName.call(this, index);
                const runtime = getRuntime();

                return resolveTranslatedCommandName(name, runtime);
            };
        }

        if (typeof itemListCtor.prototype.isEnabled === 'function') {
            const originalIsEnabled = itemListCtor.prototype.isEnabled;

            itemListCtor.prototype.isEnabled = function () {
                const runtime = getRuntime();

                if (!isRuntimeTranslationActive(runtime)) {
                    return originalIsEnabled.apply(this, arguments);
                }

                try {
                    return originalIsEnabled.apply(this, arguments);
                } catch (error) {
                    console.warn(
                        '[MogSceneItemTranslator] Failed item usability check in Window_ItemListM.isEnabled; returning disabled state to avoid scene crash',
                        error
                    );
                    return false;
                }
            };
        }

        if (typeof itemListCtor.prototype.drawItemName === 'function') {
            const originalDrawItemName = itemListCtor.prototype.drawItemName;

            itemListCtor.prototype.drawItemName = function () {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime) || arguments.length < 1) {
                    return originalDrawItemName.apply(this, arguments);
                }

                const originalItem = arguments[0];
                const translatedItem = buildTranslatedUiItem(originalItem, runtime);
                arguments[0] = translatedItem;

                return originalDrawItemName.apply(this, arguments);
            };
        }

        if (typeof itemListCtor.prototype.setHelpWindowItem === 'function') {
            const originalSetHelpWindowItem = itemListCtor.prototype.setHelpWindowItem;

            itemListCtor.prototype.setHelpWindowItem = function () {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime) || arguments.length < 1) {
                    return originalSetHelpWindowItem.apply(this, arguments);
                }

                const originalItem = arguments[0];
                const translatedItem = buildTranslatedUiItem(originalItem, runtime);
                arguments[0] = translatedItem;

                return originalSetHelpWindowItem.apply(this, arguments);
            };
        }
        return true;
    }
}
