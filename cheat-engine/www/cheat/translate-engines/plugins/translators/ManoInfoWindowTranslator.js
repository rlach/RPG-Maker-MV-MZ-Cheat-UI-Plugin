import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * Mano_InfoWindow translator.
 *
 * Supported plugin versions:
 * - Mano_InfoWindow.js v1.0.0 (MV)
 *
 * Translation notes:
 * - Text is defined in plugin parameter `list` (`DataSet[]`, `text` field).
 * - Runtime hook point is the map info window draw path (`Window_Info.drawItem`)
 *   via `Scene_Map.createInfoWindow_MA` instance patching.
 * - Only the label line is translated; numeric variable values are left untouched.
 */

const PLUGIN_NAME = 'Mano_InfoWindow';
const CACHE_TYPE = 'plugin_mano_info_window';
const CREATE_WINDOW_HOOK_FLAG = '__CHEAT_MANO_INFO_WINDOW_CREATE_HOOKED__';
const WINDOW_DRAW_ITEM_HOOK_FLAG = '__CHEAT_MANO_INFO_WINDOW_DRAW_ITEM_HOOKED__';

function normalizeString(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

export class ManoInfoWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'Mano InfoWindow';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const sceneMapProto = globalThis.Scene_Map?.prototype;
        if (!sceneMapProto || typeof sceneMapProto.createInfoWindow_MA !== 'function') {
            return false;
        }

        if (!sceneMapProto[CREATE_WINDOW_HOOK_FLAG]) {
            const originalCreateInfoWindow = sceneMapProto.createInfoWindow_MA;
            const patchInfoWindowInstance = this.patchInfoWindowInstance.bind(this);

            sceneMapProto.createInfoWindow_MA = function () {
                const result = originalCreateInfoWindow.apply(this, arguments);
                patchInfoWindowInstance(this._windowInfo_MA, this);
                if (typeof this._windowInfo_MA?.refresh === 'function') {
                    this._windowInfo_MA.refresh();
                }
                return result;
            };

            Object.defineProperty(sceneMapProto, CREATE_WINDOW_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        const existingWindow = globalThis.SceneManager?._scene?._windowInfo_MA;
        this.patchInfoWindowInstance(existingWindow, globalThis.SceneManager?._scene);
        if (typeof existingWindow?.refresh === 'function') {
            existingWindow.refresh();
        }
        return true;
    }

    patchInfoWindowInstance(windowInstance) {
        if (!windowInstance) {
            return;
        }

        const infoWindowProto = Object.getPrototypeOf(windowInstance);
        if (!infoWindowProto || typeof infoWindowProto.drawItem !== 'function') {
            return;
        }

        if (infoWindowProto[WINDOW_DRAW_ITEM_HOOK_FLAG]) {
            return;
        }

        const originalDrawItem = infoWindowProto.drawItem;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();
        const isUsableText = this.isUsableText.bind(this);

        infoWindowProto.drawItem = function () {
            const runtime = getRuntime();
            if (!runtime) {
                return originalDrawItem.apply(this, arguments);
            }

            const originalDrawText = this.drawText;
            let drawTextCallIndex = 0;

            this.drawText = function (text, x, y, maxWidth, align) {
                let nextText = text;

                if (drawTextCallIndex === 0 && isUsableText(text)) {
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

                drawTextCallIndex += 1;
                return originalDrawText.call(this, nextText, x, y, maxWidth, align);
            };

            try {
                return originalDrawItem.apply(this, arguments);
            } finally {
                this.drawText = originalDrawText;
            }
        };

        Object.defineProperty(infoWindowProto, WINDOW_DRAW_ITEM_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    async precomputeCounts() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[ManoInfoWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            this.collectListTexts(pluginEntry.parameters.list, 'pluginEntryParameter', entries);
        }

        const pluginManager = globalThis.PluginManager;
        if (typeof pluginManager?.parameters === 'function') {
            const runtimeParameters = pluginManager.parameters(this.getPluginName());
            if (runtimeParameters && typeof runtimeParameters === 'object') {
                this.collectListTexts(runtimeParameters.list, 'runtimePluginManagerParameter', entries);
            }
        }

        return entries;
    }

    collectListTexts(rawList, scope, output) {
        const list = parseJsonSafely(rawList, []);
        if (!Array.isArray(list)) {
            return;
        }

        for (let index = 0; index < list.length; index += 1) {
            const parsedItem = parseJsonSafely(list[index], null);
            if (!parsedItem || typeof parsedItem !== 'object') {
                continue;
            }

            const text = normalizeString(parsedItem.text);
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope,
                    index,
                },
            });
        }
    }

    ensureScanEntriesSync() {
        if (this._scanPrepared) {
            return;
        }

        this._scanEntries = this.buildScanEntries();
        this._scanPrepared = true;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = normalizeString(entry?.text);
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_mano_info_window_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime } = {}) {
        if (!runtime) {
            return [];
        }

        this.ensureScanEntriesSync();
        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime } = {}) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        this.ensureScanEntriesSync();
        const items = this.buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
