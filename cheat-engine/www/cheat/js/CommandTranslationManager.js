import { shouldApplyHook } from './HookGuardHelper.js';

const COMMAND_HOOK_NAME = 'CHEAT_COMMAND_TRANSLATION_HOOK';

/**
 * Returns whether any translation mode is active on the runtime
 * (full OTF, cache-only, or background batch process).
 */
export function isTranslationActive(runtime) {
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
    if (!commandList?.length || !isTranslationActive(runtime)) {
        return;
    }

    for (const entry of commandList) {
        if (!entry || entry.symbol === 'choice') {
            continue;
        }

        const name = entry.name;
        if (!name || typeof name !== 'string' || !name) {
            continue;
        }

        const canonicalName = runtime.getCanonicalSystemCommandName(name);
        const cacheKey = runtime.getCacheKey(canonicalName, 'command');

        runtime.trackCacheKeyUsage(cacheKey);
        if (runtime.hasUsableCacheValue(cacheKey)) {
            entry.name = runtime.translationCache.get(cacheKey);
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
        if (!name || typeof name !== 'string' || !name) {
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
 * Discovers all Window_Command subclasses that define their own makeCommandList.
 * Scans globalThis for Window_* constructors whose prototype chain includes
 * Window_Command.prototype. Window_Command itself is excluded — its
 * makeCommandList is a no-op, so only subclasses that actually build commands matter.
 *
 * @returns {Function[]} Array of constructor functions to hook
 */
export function discoverCommandWindowClasses() {
    const windowCommand = globalThis.Window_Command;
    if (!windowCommand) {
        return [];
    }

    const classes = [];

    for (const key of Object.getOwnPropertyNames(globalThis)) {
        if (!key.startsWith('Window_')) {
            continue;
        }

        try {
            const value = globalThis[key];
            if (
                typeof value === 'function' &&
                value !== windowCommand &&
                value.prototype instanceof windowCommand &&
                Object.prototype.hasOwnProperty.call(value.prototype, 'makeCommandList')
            ) {
                classes.push(value);
            }
        } catch (_) {
            // Some globalThis properties may throw on access
        }
    }

    return classes;
}

/**
 * Property name used to store the original (pre-hook) makeCommandList on prototypes.
 * Accessible by SystemCommands to call the unhooked version during command gathering.
 */
export const ORIGINAL_MAKE_COMMAND_LIST = '_cheat_originalMakeCommandList';

/**
 * Wraps makeCommandList on a single window class prototype.
 * After the original runs, applies cached translations to this._list.
 * Stores the original function under ORIGINAL_MAKE_COMMAND_LIST for external access.
 */
function hookMakeCommandList(windowClass, runtime) {
    const proto = windowClass.prototype;
    const original = proto.makeCommandList;

    proto[ORIGINAL_MAKE_COMMAND_LIST] = original;

    proto.makeCommandList = function () {
        original.apply(this, arguments);
        applyTranslationsToCommands(this._list, runtime);
    };
}

/**
 * Hooks makeCommandList on every discovered Window_Command subclass.
 */
function hookDiscoveredCommandWindows(runtime) {
    const classes = discoverCommandWindowClasses();
    for (const cls of classes) {
        hookMakeCommandList(cls, runtime);
    }
}

/**
 * Installs makeCommandList hooks on all Window_Command subclasses.
 * Defers installation to Scene_Boot.prototype.start — the earliest lifecycle
 * point where all scripts (core + plugins) are guaranteed to be loaded.
 * If Scene_Boot already started or is unavailable, hooks immediately.
 *
 * @param {object} runtime - The translation runtime
 */
export function installCommandTranslationHook(runtime) {
    if (!shouldApplyHook(COMMAND_HOOK_NAME)) {
        return;
    }

    const sceneBoot = globalThis.Scene_Boot;

    // If Scene_Boot is unavailable or the game already booted past it,
    // all scripts are loaded — hook immediately.
    if (!sceneBoot || (globalThis.SceneManager && globalThis.SceneManager._scene)) {
        hookDiscoveredCommandWindows(runtime);
        return;
    }

    // Defer to Scene_Boot.start — runs after all core + plugin scripts are loaded
    // but before any command windows are created.
    const originalStart = sceneBoot.prototype.start;
    sceneBoot.prototype.start = function () {
        hookDiscoveredCommandWindows(runtime);
        originalStart.apply(this, arguments);
    };
}
