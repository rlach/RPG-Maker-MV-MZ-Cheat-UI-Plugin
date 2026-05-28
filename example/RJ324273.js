/**
 * RJ324273 Game-Specific Translator
 *
 * Target plugin:
 * - InfoWindow.js (MV)
 *
 * Translation notes:
 * - The plugin renders a fixed label string in `Window_Info.refresh`.
 * - Runtime hook patches the InfoWindow instance refresh path created by
 *   `Scene_Map.start` and translates only string drawText payloads.
 *
 * Usage: Copy this file to www/cheat-settings/translate-cache/js/
 */

const BasePluginTranslator = globalThis.__CheatBasePluginTranslator;

const CACHE_TYPE = 'plugin_rj324273_info_window';
const SCENE_MAP_START_HOOK_FLAG = '__CHEAT_RJ324273_SCENE_MAP_START_HOOKED__';
const WINDOW_REFRESH_HOOK_FLAG = '__CHEAT_RJ324273_INFO_WINDOW_REFRESH_HOOKED__';

function normalizeString(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

export class RJ324273Translator extends BasePluginTranslator {
    getPluginName() {
        return 'InfoWindow';
    }

    getPluginLabel() {
        return 'RJ324273 InfoWindow';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    detectPlugin() {
        return true;
    }

    enablePluginTranslation() {
        const sceneMapProto = globalThis.Scene_Map?.prototype;
        if (!sceneMapProto || typeof sceneMapProto.start !== 'function') {
            return false;
        }

        if (!sceneMapProto[SCENE_MAP_START_HOOK_FLAG]) {
            const originalStart = sceneMapProto.start;
            const patchInfoWindowInstance = this.patchInfoWindowInstance.bind(this);

            sceneMapProto.start = function () {
                const result = originalStart.apply(this, arguments);
                patchInfoWindowInstance(this._InfoWindow);
                return result;
            };

            Object.defineProperty(sceneMapProto, SCENE_MAP_START_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        this.patchInfoWindowInstance(globalThis.SceneManager?._scene?._InfoWindow);
        return true;
    }

    patchInfoWindowInstance(windowInstance) {
        if (!windowInstance) {
            return;
        }

        const infoWindowProto = Object.getPrototypeOf(windowInstance);
        if (!infoWindowProto || typeof infoWindowProto.refresh !== 'function') {
            return;
        }

        if (infoWindowProto[WINDOW_REFRESH_HOOK_FLAG]) {
            return;
        }

        const originalRefresh = infoWindowProto.refresh;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const cacheType = this.getCacheType();

        infoWindowProto.refresh = function () {
            const runtime = getRuntime();
            if (!runtime) {
                return originalRefresh.apply(this, arguments);
            }

            const originalDrawText = this.drawText;
            this.drawText = function (text, x, y, maxWidth, align) {
                let nextText = text;

                if (isUsableText(text)) {
                    const sourceText = normalizeString(text);
                    const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                    runtime.trackCacheKeyUsage(cacheKey);

                    if (isRuntimeTranslationActive(runtime)) {
                        nextText = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                            requireRuntimeTranslationActive: true,
                            missValue: sourceText,
                            harvestMissing: false,
                        });
                    }
                }

                return originalDrawText.call(this, nextText, x, y, maxWidth, align);
            };

            try {
                return originalRefresh.apply(this, arguments);
            } finally {
                this.drawText = originalDrawText;
            }
        };

        Object.defineProperty(infoWindowProto, WINDOW_REFRESH_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    async precomputeCounts() {
        return;
    }

    collectUntranslated({ runtime } = {}) {
        if (!runtime) {
            return [];
        }

        const text = '精力';
        const cacheKey = runtime.getCacheKey(text, this.getCacheType());

        if (runtime.hasUsableCacheValue(cacheKey)) {
            return [];
        }

        return [
            {
                type: this.getCacheType(),
                id: 'plugin_rj324273_info_window_0',
                value: text,
                cacheKey,
            },
        ];
    }

    getCachedCountsSync({ runtime } = {}) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const text = '精力';
        const cacheKey = runtime.getCacheKey(text, this.getCacheType());
        const leftStrings = runtime.hasUsableCacheValue(cacheKey) ? 0 : 1;

        return {
            total: 1,
            left: leftStrings,
            totalStrings: 1,
            leftStrings,
        };
    }
}
