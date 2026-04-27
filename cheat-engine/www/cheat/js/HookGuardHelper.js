/**
 * Hook Guard Helper - Manages plugin translator hook guards on root window
 * Prevents duplicate patches when separate window initializes
 * All hook guards are stored on the root window to ensure cross-window awareness
 */

import { getRootWindow } from './RootWindowState.js'
import { isMapLike } from './TranslateCacheRuntime.js'

const HOOK_GUARDS_MAP_KEY = '__CHEAT_PLUGIN_HOOK_GUARDS__'

function isSetLike(value) {
    return (
        !!value &&
        typeof value.add === 'function' &&
        typeof value.has === 'function' &&
        typeof value.delete === 'function' &&
        typeof value.clear === 'function' &&
        typeof value.values === 'function' &&
        !isMapLike(value)
    )
}

function ensureHookGuardsMap() {
    const root = getRootWindow()

    if (!root[HOOK_GUARDS_MAP_KEY] || !isSetLike(root[HOOK_GUARDS_MAP_KEY])) {
        root[HOOK_GUARDS_MAP_KEY] = new Set()
    }

    return root[HOOK_GUARDS_MAP_KEY]
}

/**
 * Check if a hook has already been applied (on root window)
 * @param {string} hookName - Unique identifier for the hook (e.g., 'DTEXT_PICTURE_TRANSLATOR')
 * @returns {boolean} true if hook was already applied, false otherwise
 */
export function isHookAlreadyApplied(hookName) {
    if (typeof hookName !== 'string' || !hookName.trim()) {
        return false
    }

    const guards = ensureHookGuardsMap()
    return guards.has(hookName)
}

/**
 * Mark a hook as applied (on root window)
 * @param {string} hookName - Unique identifier for the hook
 * @returns {boolean} true if marked successfully (was not already marked), false if already marked
 */
export function markHookAsApplied(hookName) {
    if (typeof hookName !== 'string' || !hookName.trim()) {
        return false
    }

    const guards = ensureHookGuardsMap()

    if (guards.has(hookName)) {
        return false
    }

    guards.add(hookName)
    return true
}

/**
 * Unified guard check + mark pattern
 * Replaces: if (window.__CHEAT_*_HOOKED__) { return; } ... window.__CHEAT_*_HOOKED__ = true;
 *
 * @param {string} hookName - Unique identifier for the hook
 * @returns {boolean} true if this is the first time (hook was applied), false if already applied
 *
 * @example
 * if (!shouldApplyHook('MY_TRANSLATOR_HOOK')) { return; }
 * // Apply patches here...
 * // No need to manually set flag; it's already marked
 */
export function shouldApplyHook(hookName) {
    if (isHookAlreadyApplied(hookName)) {
        return false
    }

    markHookAsApplied(hookName)
    return true
}

/**
 * Clear all hook guards (for testing/reset scenarios)
 * NOT recommended for production use
 */
export function clearAllHookGuards() {
    const root = getRootWindow()
    root[HOOK_GUARDS_MAP_KEY] = new Set()
}

/**
 * Get list of all applied hooks (for debugging)
 * @returns {string[]} Array of hook names that have been applied
 */
export function getAppliedHooks() {
    const guards = ensureHookGuardsMap()
    return Array.from(guards)
}
