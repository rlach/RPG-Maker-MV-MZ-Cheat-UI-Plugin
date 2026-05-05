import { shouldApplyHook } from './HookGuardHelper.js';

const COMMAND_HOOK_NAME = 'CHEAT_COMMAND_TRANSLATION_HOOK';

/**
 * Returns whether any translation mode is active on the runtime
 * (full OTF, cache-only, or background batch process).
 */
function isTranslationActive(runtime) {
    return (
        runtime.isTranslationEnabled() ||
        !!runtime.translateCacheWhenDisabled ||
        runtime.isNonOtfTranslationProcessActive()
    );
}

/**
 * Applies cached translations to a command list in-place.
 * Entries with symbol 'choice' are skipped (dialog choices, not menu commands).
 * For each eligible entry, looks up the canonical source name, resolves translation
 * from cache, and replaces entry.name if a cached translation exists.
 * Untranslated entries are tracked for harvesting.
 *
 * @param {Array<{name: string, symbol: string, enabled: boolean, ext: any}>} commandList
 * @param {object} runtime - The translation runtime (TranslationRuntime instance)
 */
export function applyTranslationsToCommands(commandList, runtime) {
    if (!commandList || !commandList.length || !isTranslationActive(runtime)) {
        return;
    }

    for (const entry of commandList) {
        if (!entry || entry.symbol === 'choice') {
            continue;
        }

        const name = entry.name;
        if (!name || typeof name !== 'string' || !name.trim()) {
            continue;
        }

        const canonicalName = runtime.getCanonicalSystemCommandName(name);
        const cacheKey = runtime.getCacheKey(canonicalName, 'command');

        if (runtime.hasUsableCacheValue(cacheKey)) {
            runtime.trackCacheKeyUsage(cacheKey, { harvestMissing: false });
            entry.name = runtime.translationCache.get(cacheKey);
        } else {
            runtime.trackCacheKeyUsage(cacheKey);
        }
    }
}

/**
 * Collects untranslated command entries from a command list for batch translation.
 * Returns items array suitable for batchManager.runBatchedTranslation().
 *
 * @param {Array<{name: string, symbol: string}>} commandList
 * @param {object} runtime
 * @returns {Array<{type: string, id: string, value: string, cacheKey: string}>}
 */
export function collectUntranslatedCommands(commandList, runtime) {
    if (!commandList || !commandList.length) {
        return [];
    }

    const items = [];

    for (let i = 0; i < commandList.length; i++) {
        const entry = commandList[i];
        if (!entry || entry.symbol === 'choice') {
            continue;
        }

        const name = entry.name;
        if (!name || typeof name !== 'string' || !name.trim()) {
            continue;
        }

        const canonicalName = runtime.getCanonicalSystemCommandName(name);
        const cacheKey = runtime.getCacheKey(canonicalName, 'command');

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            items.push({
                type: 'command',
                id: `cmd_${i}`,
                value: canonicalName,
                cacheKey,
            });
        }
    }

    return items;
}

/**
 * Installs the makeCommandList hook on Window_Command.prototype.
 * After the original makeCommandList runs, applies cached translations to this._list.
 * Uses HookGuardHelper to prevent double-installation in separate window.
 *
 * @param {object} runtime - The translation runtime
 */
export function installCommandTranslationHook(runtime) {
    if (!shouldApplyHook(COMMAND_HOOK_NAME)) {
        return;
    }

    const originalMakeCommandList = Window_Command.prototype.makeCommandList;

    Window_Command.prototype.makeCommandList = function () {
        originalMakeCommandList.apply(this, arguments);
        applyTranslationsToCommands(this._list, runtime);
    };
}
