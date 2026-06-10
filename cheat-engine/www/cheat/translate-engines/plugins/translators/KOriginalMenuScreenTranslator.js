/**
 * K_OriginalMenuScreenTranslator
 *
 * Translator for K_OriginalMenuScreen.js (MV, version not specified in source)
 *
 * This plugin adds a custom information bar to the main menu. The translatable
 * surface is made up of the configurable Information_* parameter strings plus
 * the fixed labels shown in the top bar:
 * - "場所" (map label)
 * - "プレイ時間" (playtime label)
 *
 * Dynamic values such as the current map name and playtime are intentionally not
 * collected or translated.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const CACHE_TYPE = 'plugin_k_original_menu_screen';
const INFORMATION_PARAM_PREFIX = 'Information_';
const LOCATION_LABEL_TEXT = '場所';
const PLAYTIME_LABEL_TEXT = 'プレイ時間';

export class KOriginalMenuScreenTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'K_OriginalMenuScreen';
    }

    getPluginLabel() {
        return 'K Original Menu Screen';
    }

    getCacheType() {
        return CACHE_TYPE;
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
                console.warn('[KOriginalMenuScreenTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const parameters = this._resolvePluginParameters();
        if (!parameters) {
            return entries;
        }

        this._collectInformationEntries(parameters, entries);

        if (this._shouldCollectLocationInfo(parameters)) {
            entries.push(
                {
                    text: LOCATION_LABEL_TEXT,
                    source: { scope: 'uiLabel', field: 'locationLabel' },
                },
                {
                    text: PLAYTIME_LABEL_TEXT,
                    source: { scope: 'uiLabel', field: 'playtimeLabel' },
                }
            );
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

    enablePluginTranslation() {
        const sceneMenuCtor = window.Scene_Menu;
        if (!sceneMenuCtor?.prototype) {
            return false;
        }

        const sceneMenuPrototype = sceneMenuCtor.prototype;
        const originalCreateInformationWindow = sceneMenuPrototype.createInformationWindow;
        if (typeof originalCreateInformationWindow !== 'function') {
            return false;
        }

        if (sceneMenuPrototype.__CHEAT_K_ORIGINAL_MENU_SCREEN_CREATE_INFO_PATCHED__) {
            return true;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();

        const patchInformationWindowInstance = (windowInstance) => {
            if (!windowInstance || typeof windowInstance !== 'object') {
                return;
            }

            if (windowInstance.__CHEAT_K_ORIGINAL_MENU_SCREEN_WINDOW_PATCHED__) {
                return;
            }

            if (
                typeof windowInstance.setText !== 'function' ||
                typeof windowInstance.drawText !== 'function'
            ) {
                return;
            }

            const originalSetText = windowInstance.setText;
            const originalDrawText = windowInstance.drawText;

            windowInstance.setText = function (text) {
                let renderedText = text;

                try {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime)) {
                        renderedText = resolveRuntimeTranslation(renderedText, runtime, cacheType, {
                            requireRuntimeTranslationActive: true,
                            missValue: renderedText,
                        });
                    }
                } catch (error) {
                    console.warn(
                        '[KOriginalMenuScreenTranslator] Failed to translate information text',
                        error
                    );
                }

                return originalSetText.call(this, renderedText);
            };

            windowInstance.drawText = function (text, x, y, maxWidth, align) {
                let renderedText = text;

                try {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime)) {
                        if (text === LOCATION_LABEL_TEXT || text === PLAYTIME_LABEL_TEXT) {
                            renderedText = resolveRuntimeTranslation(
                                renderedText,
                                runtime,
                                cacheType,
                                {
                                    requireRuntimeTranslationActive: true,
                                    missValue: renderedText,
                                }
                            );
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[KOriginalMenuScreenTranslator] Failed to translate information label',
                        error
                    );
                }

                return originalDrawText.call(this, renderedText, x, y, maxWidth, align);
            };

            Object.defineProperty(
                windowInstance,
                '__CHEAT_K_ORIGINAL_MENU_SCREEN_WINDOW_PATCHED__',
                {
                    value: true,
                    configurable: true,
                    enumerable: false,
                    writable: false,
                }
            );
        };

        sceneMenuPrototype.createInformationWindow = function () {
            const result = originalCreateInformationWindow.apply(this, arguments);

            try {
                patchInformationWindowInstance(this._informationWindow);
            } catch (error) {
                console.warn(
                    '[KOriginalMenuScreenTranslator] Failed to patch information window instance',
                    error
                );
            }

            return result;
        };

        Object.defineProperty(
            sceneMenuPrototype,
            '__CHEAT_K_ORIGINAL_MENU_SCREEN_CREATE_INFO_PATCHED__',
            {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            }
        );

        return true;
    }

    _resolvePluginParameters() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            return pluginEntry.parameters;
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const parameters = window.PluginManager.parameters(this.getPluginName());
            if (parameters && typeof parameters === 'object') {
                return parameters;
            }
        }

        return null;
    }

    _shouldCollectLocationInfo(parameters) {
        const value = parameters?.Add_LocationInfo;
        return value !== 0 && value !== '0' && value !== false;
    }

    _collectInformationEntries(parameters, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const [paramKey, value] of Object.entries(parameters)) {
            if (!paramKey.startsWith(INFORMATION_PARAM_PREFIX)) {
                continue;
            }

            const text = String(value || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope: 'pluginParam',
                    paramKey,
                },
            });
        }
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `k_original_menu_screen_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
