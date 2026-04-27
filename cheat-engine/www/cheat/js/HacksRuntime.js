import { KeyValueStorage } from './KeyValueStorage.js';
import {
    ensureRootWindowStateValue,
    getRootWindow,
    setRootWindowStateValue,
} from './RootWindowState.js';

const HACKS_STORAGE = new KeyValueStorage('./www/cheat-settings/hacks.json');
const STORAGE_KEY = 'data';
const BITMAP_GET_PIXEL_LONG_FIX_KEY = 'bitmapGetPixelLongFix';
const PATCH_GUARD_KEY = '__CHEAT_BITMAP_GET_PIXEL_LONG_FIX_PATCHED__';
const PATCH_ORIGINAL_KEY = '__CHEAT_BITMAP_GET_PIXEL_LONG_FIX_ORIGINAL__';
const MESSAGE_SKIP_PLUGIN_NAME = 'MessageSkip';
const MESSAGE_SKIP_SWITCH_KEYS = ['SkipSwitchId', 'スキップスイッチ'];

function hasOwn(source, key) {
    // eslint-disable-next-line prefer-object-has-own
    return Object.prototype.hasOwnProperty.call(source, key);
}

function toLongSafe(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.trunc(num) : 0;
}

function getPluginEntry(root, pluginName) {
    if (!root || !Array.isArray(root.$plugins) || !pluginName) {
        return null;
    }

    const normalizedPluginName = String(pluginName).trim().toLowerCase();
    if (!normalizedPluginName) {
        return null;
    }

    return (
        root.$plugins.find((plugin) => {
            if (!plugin || typeof plugin.name !== 'string' || plugin.status === false) {
                return false;
            }

            return plugin.name.trim().toLowerCase() === normalizedPluginName;
        }) || null
    );
}

function getPluginParameters(root, pluginName) {
    if (!root || !pluginName) {
        return {};
    }

    const pluginManager = root.PluginManager;
    if (pluginManager && typeof pluginManager.parameters === 'function') {
        const parameters = pluginManager.parameters(pluginName);
        if (parameters && typeof parameters === 'object') {
            return parameters;
        }
    }

    const pluginEntry = getPluginEntry(root, pluginName);
    if (typeof pluginEntry?.parameters === 'object') {
        return pluginEntry.parameters;
    }

    return {};
}

function getFirstDefinedProperty(source, keys) {
    if (!source || typeof source !== 'object' || !Array.isArray(keys)) {
        return undefined;
    }

    for (const key of keys) {
        if (hasOwn(source, key)) {
            return source[key];
        }
    }

    return undefined;
}

function toSwitchId(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return 0;
    }

    return Math.max(0, Math.trunc(num));
}

class HacksRuntime {
    constructor() {
        this.state = {
            [BITMAP_GET_PIXEL_LONG_FIX_KEY]: false,
        };
        this._load();
    }

    _load() {
        try {
            const json = HACKS_STORAGE.getItem(STORAGE_KEY);
            if (!json) {
                return;
            }

            const data = JSON.parse(json);
            if (
                data &&
                typeof data === 'object' &&
                hasOwn(data, BITMAP_GET_PIXEL_LONG_FIX_KEY)
            ) {
                this.state[BITMAP_GET_PIXEL_LONG_FIX_KEY] = !!data[BITMAP_GET_PIXEL_LONG_FIX_KEY];
            }
        } catch (err) {
            console.warn('[HacksRuntime] Failed to load settings', err);
        }
    }

    _save() {
        try {
            HACKS_STORAGE.setItem(STORAGE_KEY, JSON.stringify(this.state));
        } catch (err) {
            console.warn('[HacksRuntime] Failed to save settings', err);
        }
    }

    getState() {
        return { ...this.state };
    }

    isBitmapGetPixelLongFixEnabled() {
        return !!this.state[BITMAP_GET_PIXEL_LONG_FIX_KEY];
    }

    setBitmapGetPixelLongFixEnabled(enabled) {
        this.state[BITMAP_GET_PIXEL_LONG_FIX_KEY] = !!enabled;
        this._save();

        if (this.state[BITMAP_GET_PIXEL_LONG_FIX_KEY]) {
            return this.applyBitmapGetPixelLongFix();
        }

        return this.removeBitmapGetPixelLongFix();
    }

    applyEnabledHacks() {
        if (this.isBitmapGetPixelLongFixEnabled()) {
            this.applyBitmapGetPixelLongFix();
        }
    }

    getMessageSkipForcedSkipSwitchId() {
        const root = getRootWindow();
        const parameters = getPluginParameters(root, MESSAGE_SKIP_PLUGIN_NAME);
        const rawSwitchId = getFirstDefinedProperty(parameters, MESSAGE_SKIP_SWITCH_KEYS);
        const switchId = toSwitchId(rawSwitchId);

        if (switchId > 0) {
            return switchId;
        }

        const pluginEntry = getPluginEntry(root, MESSAGE_SKIP_PLUGIN_NAME);
        if (!pluginEntry) {
            return switchId;
        }

        return toSwitchId(
            getFirstDefinedProperty(pluginEntry?.parameters, MESSAGE_SKIP_SWITCH_KEYS)
        );
    }

    hasMessageSkipConfiguredSkipSwitch() {
        const root = getRootWindow();
        const parameters = getPluginParameters(root, MESSAGE_SKIP_PLUGIN_NAME);
        if (getFirstDefinedProperty(parameters, MESSAGE_SKIP_SWITCH_KEYS) !== undefined) {
            return true;
        }

        const pluginEntry = getPluginEntry(root, MESSAGE_SKIP_PLUGIN_NAME);
        return (
            getFirstDefinedProperty(pluginEntry?.parameters, MESSAGE_SKIP_SWITCH_KEYS) !== undefined
        );
    }

    hasMessageSkipForcedSkipSwitch() {
        return this.getMessageSkipForcedSkipSwitchId() > 0;
    }

    isMessageSkipForcedSkipEnabled() {
        const root = getRootWindow();
        const switchId = this.getMessageSkipForcedSkipSwitchId();
        const gameSwitches = root?.$gameSwitches;

        if (!switchId || !gameSwitches || typeof gameSwitches.value !== 'function') {
            return false;
        }

        return !!gameSwitches.value(switchId);
    }

    setMessageSkipForcedSkipEnabled(enabled) {
        const root = getRootWindow();
        const switchId = this.getMessageSkipForcedSkipSwitchId();
        const gameSwitches = root?.$gameSwitches;

        if (!switchId || !gameSwitches || typeof gameSwitches.setValue !== 'function') {
            return false;
        }

        gameSwitches.setValue(switchId, !!enabled);
        return !!gameSwitches.value(switchId);
    }

    applyBitmapGetPixelLongFix() {
        const root = getRootWindow();
        const bitmapProto = root?.Bitmap?.prototype;

        if (!bitmapProto || typeof bitmapProto.getPixel !== 'function') {
            return false;
        }

        if (bitmapProto[PATCH_GUARD_KEY]) {
            return true;
        }

        const original = bitmapProto.getPixel;

        Object.defineProperty(bitmapProto, PATCH_ORIGINAL_KEY, {
            value: original,
            configurable: true,
            writable: true,
            enumerable: false,
        });

        bitmapProto.getPixel = function (x, y) {
            return original.call(this, toLongSafe(x), toLongSafe(y));
        };

        Object.defineProperty(bitmapProto, PATCH_GUARD_KEY, {
            value: true,
            configurable: true,
            writable: true,
            enumerable: false,
        });

        console.log('[HacksRuntime] Installed Bitmap.getPixel long-type fix');
        return true;
    }

    removeBitmapGetPixelLongFix() {
        const root = getRootWindow();
        const bitmapProto = root?.Bitmap?.prototype;

        if (!bitmapProto) {
            return false;
        }

        if (!bitmapProto[PATCH_GUARD_KEY]) {
            return true;
        }

        const original = bitmapProto[PATCH_ORIGINAL_KEY];
        if (typeof original === 'function') {
            bitmapProto.getPixel = original;
        }

        try {
            delete bitmapProto[PATCH_GUARD_KEY];
        } catch (err) {
            console.warn('[HacksRuntime] Failed to delete patch guard flag', err);
            bitmapProto[PATCH_GUARD_KEY] = false;
        }

        try {
            delete bitmapProto[PATCH_ORIGINAL_KEY];
        } catch (err) {
            console.warn('[HacksRuntime] Failed to delete original method reference', err);
            bitmapProto[PATCH_ORIGINAL_KEY] = undefined;
        }

        console.log('[HacksRuntime] Removed Bitmap.getPixel long-type fix');
        return true;
    }
}

export const HACKS_RUNTIME = ensureRootWindowStateValue(
    '__HACKS_RUNTIME',
    () => new HacksRuntime()
);
setRootWindowStateValue('__HACKS_RUNTIME', HACKS_RUNTIME);

export function ensureHacksRuntime() {
    HACKS_RUNTIME.applyEnabledHacks();
    setRootWindowStateValue('__HACKS_RUNTIME', HACKS_RUNTIME);
    return HACKS_RUNTIME;
}
