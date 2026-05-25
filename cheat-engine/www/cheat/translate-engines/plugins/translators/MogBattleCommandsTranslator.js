import { BasePluginTranslator } from '../BasePluginTranslator.js';

/*
 * MOG_BattleCommands translator
 * Supported plugin versions:
 * - Legacy versions (existing behavior): command-name image lookup fix via command cache keys
 * - v1.3 (MV): skill-type commands (for example, "Magic/Special Skill") are resolved from
 *   skillType cache keys first, then command cache keys as fallback
 */

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

    const orderedPrefixes = [
        `skillType:${sourceLang}-${targetLang}-`,
        `command:${sourceLang}-${targetLang}-`,
    ];

    for (const prefix of orderedPrefixes) {
        addEntriesForPrefix(runtime.translationCache, prefix, translatedToOriginal);
    }

    return translatedToOriginal;
}

function addEntriesForPrefix(translationCache, prefix, translatedToOriginal) {
    for (const [cacheKey, value] of translationCache.entries()) {
        const originalName = getOriginalNameFromCacheKey(cacheKey, prefix);
        if (!originalName) {
            continue;
        }

        const translatedName = normalizeTranslatedName(value);
        if (!translatedName || translatedToOriginal.has(translatedName)) {
            continue;
        }

        // Keep first match so skillType wins over command when both map to same translation.
        translatedToOriginal.set(translatedName, originalName);
    }
}

function getOriginalNameFromCacheKey(cacheKey, prefix) {
    if (typeof cacheKey !== 'string' || !cacheKey.startsWith(prefix)) {
        return null;
    }

    const originalName = cacheKey.slice(prefix.length).trim();
    return originalName || null;
}

function normalizeTranslatedName(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
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
    initialDelayBeforeEnablePluginTranslationMs = 2000;

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
            !Window_ActorCommand ||
            typeof Window_ActorCommand.prototype.load_com_images !== 'function'
        ) {
            return false;
        }

        const originalLoadComImages = Window_ActorCommand.prototype.load_com_images;

        if (!originalLoadComImages || typeof originalLoadComImages !== 'function') {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);

        // MOG_BattleCommands looks up command names to find matching icon images.
        // Since our makeCommandList hook translates names in-place, we temporarily
        // swap them back to originals during load_com_images, then restore.
        Window_ActorCommand.prototype.load_com_images = function () {
            const runtime = getRuntime();
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
        return true;
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
}
