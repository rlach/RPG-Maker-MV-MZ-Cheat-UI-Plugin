import { KeyValueStorage } from './KeyValueStorage.js';

const HACKS_STORAGE = new KeyValueStorage('./www/cheat-settings/hacks.json');
const STORAGE_KEY = 'data';
const BITMAP_GET_PIXEL_LONG_FIX_KEY = 'bitmapGetPixelLongFix';
const PATCH_GUARD_KEY = '__CHEAT_BITMAP_GET_PIXEL_LONG_FIX_PATCHED__';
const PATCH_ORIGINAL_KEY = '__CHEAT_BITMAP_GET_PIXEL_LONG_FIX_ORIGINAL__';

function getRootWindow() {
    if (window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed) {
        return window.opener;
    }

    return window;
}

function toLongSafe(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.trunc(num) : 0;
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
                Object.hasOwn(data, BITMAP_GET_PIXEL_LONG_FIX_KEY)
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

export const HACKS_RUNTIME = new HacksRuntime();

export function ensureHacksRuntime() {
    HACKS_RUNTIME.applyEnabledHacks();
    return HACKS_RUNTIME;
}
