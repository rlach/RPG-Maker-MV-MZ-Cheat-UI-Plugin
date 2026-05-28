import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * LL_MenuScreenShop translator
 *
 * Supported plugin versions:
 * - LL_MenuScreenShop.js v1.0.3 (MZ)
 *
 * Translation notes:
 * - Translatable text is stored in the `shopLists` plugin parameter entries.
 * - Runtime hook patches the per-scene message window instance so shop clerk
 *   messages are translated when they are rendered.
 */

const PLUGIN_NAME = 'LL_MenuScreenShop';
const CACHE_TYPE = 'plugin_ll_menu_screen_shop';
const PARAM_SHOP_LISTS = 'shopLists';
const SHOP_TEXT_FIELDS = ['commandMessage', 'buyMessage', 'sellMessage', 'thanksMessage'];
const SHOP_MESSAGE_WINDOW_HOOK_FLAG = '__CHEAT_LL_MENU_SCREEN_SHOP_MESSAGE_WINDOW_PATCHED__';

export class LL_MenuScreenShopTranslator extends BasePluginTranslator {
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
        return 'LL MenuScreenShop';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    async precomputeCounts() {
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
                console.warn('[LL_MenuScreenShopTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        for (const source of this._resolveParameterSources()) {
            const rawLists = parseJsonSafely(source.parameters?.[PARAM_SHOP_LISTS], []);
            if (!Array.isArray(rawLists)) {
                continue;
            }

            for (let index = 0; index < rawLists.length; index += 1) {
                const parsedItem = parseJsonSafely(rawLists[index], null);
                if (!parsedItem || typeof parsedItem !== 'object') {
                    continue;
                }

                for (const field of SHOP_TEXT_FIELDS) {
                    const text = parsedItem[field];
                    if (!this.isUsableText(text)) {
                        continue;
                    }

                    entries.push({
                        text: String(text),
                        source: {
                            scope: source.scope,
                            field,
                            index,
                        },
                    });
                }
            }
        }

        return entries;
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this._buildUniquePendingItems(runtime);
        const totalStrings = items.length;
        const leftStrings = items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey)).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }

    enablePluginTranslation() {
        const sceneShopProto = window.Scene_Shop?.prototype;
        if (!sceneShopProto || typeof sceneShopProto.createMessageWindow !== 'function') {
            return false;
        }

        if (sceneShopProto[SHOP_MESSAGE_WINDOW_HOOK_FLAG]) {
            return true;
        }

        const originalCreateMessageWindow = sceneShopProto.createMessageWindow;
        const translator = this;

        sceneShopProto.createMessageWindow = function () {
            const result = originalCreateMessageWindow.apply(this, arguments);
            translator.patchMessageWindowInstance(this._messageWindow);
            return result;
        };

        this.patchMessageWindowInstance(window.SceneManager?._scene?._messageWindow);

        Object.defineProperty(sceneShopProto, SHOP_MESSAGE_WINDOW_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    patchMessageWindowInstance(messageWindow) {
        if (!messageWindow) {
            return;
        }

        const proto = Object.getPrototypeOf(messageWindow);
        if (!proto || typeof proto.setText !== 'function' || proto[SHOP_MESSAGE_WINDOW_HOOK_FLAG]) {
            return;
        }

        const originalSetText = proto.setText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();

        proto.setText = function (text) {
            if (!isUsableText(text)) {
                return originalSetText.apply(this, arguments);
            }

            try {
                const runtime = getRuntime();
                const sourceText = String(text);
                if (!runtime) {
                    return originalSetText.call(this, sourceText);
                }

                const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                runtime.trackCacheKeyUsage(cacheKey);

                if (!isRuntimeTranslationActive(runtime)) {
                    return originalSetText.call(this, sourceText);
                }

                const translated = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                    requireRuntimeTranslationActive: true,
                    missValue: sourceText,
                });

                return originalSetText.call(
                    this,
                    isUsableText(translated) ? translated : sourceText
                );
            } catch (error) {
                console.warn('[LL_MenuScreenShopTranslator] Failed to translate shop message', error);
                return originalSetText.apply(this, arguments);
            }
        };

        Object.defineProperty(proto, SHOP_MESSAGE_WINDOW_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _resolveParameterSources() {
        const sources = [];
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            sources.push({ scope: 'pluginEntryParameter', parameters: pluginEntry.parameters });
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const runtimeParameters = window.PluginManager.parameters(this.getPluginName());
            if (runtimeParameters && typeof runtimeParameters === 'object') {
                sources.push({ scope: 'runtimePluginManagerParameter', parameters: runtimeParameters });
            }
        }

        return sources;
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_ll_menu_screen_shop_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}