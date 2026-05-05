import { BasePluginTranslator } from '../BasePluginTranslator.js';

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
            translatedToOriginal.set(translatedName, originalName);
        }
    }

    return translatedToOriginal;
}

function swapToOriginalNames(commandList, translatedToOriginal) {
    if (!Array.isArray(commandList) || translatedToOriginal.size === 0) {
        return [];
    }

    const replacedEntries = [];

    for (const command of commandList) {
        const currentName = command?.name?.trim();
        if (!currentName) {
            continue;
        }

        const originalName = translatedToOriginal.get(currentName);
        if (!originalName || originalName === command.name) {
            continue;
        }

        replacedEntries.push({ command, previousName: command.name });
        command.name = originalName;
    }

    return replacedEntries;
}

function restoreCommandNames(replacedEntries) {
    for (const entry of replacedEntries) {
        entry.command.name = entry.previousName;
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
        if (
            !globalThis.Window_ActorCommand ||
            typeof Window_ActorCommand.prototype.load_com_images !== 'function'
        ) {
            return;
        }

        const originalLoadComImages = Window_ActorCommand.prototype.load_com_images;

        // MOG_BattleCommands looks up command names to find matching icon images.
        // Since our makeCommandList hook translates names in-place, we temporarily
        // swap them back to originals during load_com_images, then restore.
        Window_ActorCommand.prototype.load_com_images = function () {
            const runtime = BasePluginTranslator.ensureGlobalRuntimeContract();
            let replacedEntries = [];

            try {
                const translatedToOriginal = buildTranslatedToOriginalCommandMap(runtime);
                replacedEntries = swapToOriginalNames(this._list, translatedToOriginal);
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
