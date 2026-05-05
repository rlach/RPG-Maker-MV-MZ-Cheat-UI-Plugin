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
 * Wraps makeCommandList on a single window class prototype.
 * After the original runs, applies cached translations to this._list.
 */
function hookMakeCommandList(windowClass, runtime) {
    const proto = windowClass.prototype;
    const original = proto.makeCommandList;

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
