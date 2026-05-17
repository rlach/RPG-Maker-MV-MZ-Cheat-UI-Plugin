import { BasePluginTranslator } from '../BasePluginTranslator.js';

/*
 * MOG_SceneMenu.js
 * Version: 1.2
 * Target: MV
 *
 * This plugin loads command icon filenames from command names inside
 * Scene_Menu.prototype.loadBitmapsMain. When command labels are translated,
 * image loading can fail because translated names do not match disk filenames.
 *
 * Runtime strategy:
 * - Build a translated->original command-name map from command cache entries.
 * - Temporarily swap command names back to originals only while
 *   loadBitmapsMain executes.
 * - Restore translated names immediately after the original method returns.
 */

function buildTranslatedToOriginalCommandMap(runtime) {
    const translatedToOriginal = new Map();
    const prefix = `command:${runtime.sourceLang}-${runtime.targetLang}-`;

    for (const [cacheKey, value] of runtime.translationCache.entries()) {
        if (typeof cacheKey !== 'string' || !cacheKey.startsWith(prefix)) {
            continue;
        }

        const translatedName = typeof value === 'string' ? value.trim() : '';
        if (!translatedName) {
            continue;
        }

        const originalName = cacheKey.slice(prefix.length);
        if (!originalName.trim()) {
            continue;
        }

        if (!translatedToOriginal.has(translatedName)) {
            translatedToOriginal.set(translatedName, originalName);
        }
    }

    return translatedToOriginal;
}

function swapCommandNamesToOriginal(commandList, translatedToOriginal, runtime) {
    if (!Array.isArray(commandList) || translatedToOriginal.size === 0) {
        return [];
    }

    const replacedEntries = [];
    for (const command of commandList) {
        const currentName = typeof command?.name === 'string' ? command.name.trim() : '';
        if (!currentName) {
            continue;
        }

        const originalName = translatedToOriginal.get(currentName);
        if (!originalName || originalName === command.name) {
            continue;
        }

        const cacheKey = runtime.getCacheKey(originalName, 'command');
        runtime.trackCacheKeyUsage(cacheKey);

        replacedEntries.push({
            command,
            previousName: command.name,
        });
        command.name = originalName;
    }

    return replacedEntries;
}

function restoreCommandNames(replacedEntries) {
    for (const entry of replacedEntries) {
        entry.command.name = entry.previousName;
    }
}

export class MogSceneMenuTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MOG_SceneMenu';
    }

    getPluginLabel() {
        return 'MOG SceneMenu';
    }

    getCacheType() {
        return 'plugin_mog_scene_menu';
    }

    enablePluginTranslation() {
        if (
            !window.Scene_Menu ||
            !Scene_Menu.prototype ||
            typeof Scene_Menu.prototype.loadBitmapsMain !== 'function'
        ) {
            return false;
        }

        const originalLoadBitmapsMain = Scene_Menu.prototype.loadBitmapsMain;

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);

        Scene_Menu.prototype.loadBitmapsMain = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalLoadBitmapsMain.apply(this, arguments);
            }

            let replacedEntries = [];
            try {
                const translatedToOriginal = buildTranslatedToOriginalCommandMap(runtime);
                replacedEntries = swapCommandNamesToOriginal(
                    this._commandWindow ? this._commandWindow._list : null,
                    translatedToOriginal,
                    runtime
                );
            } catch (error) {
                console.warn(
                    '[MogSceneMenuTranslator] Failed to restore original command names for icon loading',
                    error
                );
            }

            try {
                return originalLoadBitmapsMain.apply(this, arguments);
            } finally {
                restoreCommandNames(replacedEntries);
            }
        };

        return true;
    }

    async precomputeCounts() {
        return;
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}