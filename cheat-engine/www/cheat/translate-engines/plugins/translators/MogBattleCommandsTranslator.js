import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_MOG_BATTLE_COMMANDS_TRANSLATOR_HOOKED__';

function resolveTranslationRuntime() {
    return typeof window.__ensureTranslationRuntime === 'function'
        ? window.__ensureTranslationRuntime()
        : window.__TranslationRuntime || null;
}

function buildTranslatedToOriginalCommandMap(runtime) {
    const translatedToOriginal = new Map();

    if (!(runtime?.translationCache instanceof Map)) {
        return translatedToOriginal;
    }

    const sourceLang = String(runtime.sourceLang || '').trim();
    const targetLang = String(runtime.targetLang || '').trim();
    if (!sourceLang || !targetLang) {
        return translatedToOriginal;
    }

    const prefix = `command:${sourceLang}-${targetLang}-`;

    for (const [cacheKey, value] of runtime.translationCache.entries()) {
        if (typeof cacheKey !== 'string' || !cacheKey.startsWith(prefix)) {
            continue;
        }

        const translatedName = typeof value === 'string' ? value.trim() : '';
        if (!translatedName) {
            continue;
        }

        const originalName = cacheKey.slice(prefix.length);
        if (!originalName?.trim()) {
            continue;
        }

        if (!translatedToOriginal.has(translatedName)) {
            translatedToOriginal.set(translatedName, {
                originalName,
                cacheKey,
            });
        }
    }

    return translatedToOriginal;
}

function swapTranslatedCommandNamesWithOriginal(commandList, translatedToOriginal, runtime) {
    if (!Array.isArray(commandList) || translatedToOriginal.size === 0) {
        return [];
    }

    const replacedEntries = [];

    for (const command of commandList) {
        const currentName = command?.name?.trim();
        if (!currentName) {
            continue;
        }

        const match = translatedToOriginal.get(currentName);
        if (!match?.originalName || match.originalName === command.name) {
            continue;
        }

        replacedEntries.push({
            command,
            previousName: command.name,
        });
        command.name = match.originalName;

        if (typeof runtime?.markCacheKeySeen === 'function') {
            runtime.markCacheKeySeen(match.cacheKey);
        }
    }

    return replacedEntries;
}

function restoreCommandNames(replacedEntries) {
    if (!Array.isArray(replacedEntries)) {
        return;
    }

    for (const entry of replacedEntries) {
        if (entry?.command) {
            entry.command.name = entry.previousName;
        }
    }
}

export class MogBattleCommandsTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MOG_BattleCommands';
    }

    getPluginLabel() {
        return 'MOG BattleCommands';
    }

    getCacheType() {
        return 'plugin_mog_battle_commands';
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (
            !window.Window_ActorCommand ||
            !Window_ActorCommand.prototype ||
            typeof Window_ActorCommand.prototype.load_com_images !== 'function'
        ) {
            return;
        }

        const originalLoadComImages = Window_ActorCommand.prototype.load_com_images;

        Window_ActorCommand.prototype.load_com_images = function () {
            const runtime = resolveTranslationRuntime();
            let replacedEntries = [];

            try {
                const translatedToOriginal = buildTranslatedToOriginalCommandMap(runtime);
                replacedEntries = swapTranslatedCommandNamesWithOriginal(
                    this._list,
                    translatedToOriginal,
                    runtime
                );
            } catch (error) {
                console.warn(
                    '[MogBattleCommandsTranslator] Failed to resolve original command names for icon loading',
                    error
                );
            }

            try {
                return originalLoadComImages.apply(this, arguments);
            } finally {
                restoreCommandNames(replacedEntries);
            }
        };

        window[RUNTIME_HOOK_GUARD] = true;
    }

    async prepareTranslator() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    countPluginAmountSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}