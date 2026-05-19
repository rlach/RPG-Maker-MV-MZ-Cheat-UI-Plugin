/**
 * NuunSaveScreen3Translator
 * 
 * Translator for NUUN's SaveScreen_3 plugin (v3.0.0+)
 * 
 * NUUN_SaveScreen_3.js is a comprehensive save screen enhancement plugin for RPG Maker MZ.
 * It allows customization of save screen layout, display of actor information,
 * and custom parameter displays. This translator extracts and manages translations for:
 * 
 * 1. ParamName labels - Custom labels for each displayed parameter (Location, Gold, etc.)
 *    stored in SaveLayout.SaveMainWindowList.ContentsList[].ParamName
 * 
 * This translator intentionally only tracks stable ParamName labels.
 * Dynamic chapter/AnyName values are not tracked to avoid duplicate cache entries.
 * 
 * Supported versions: 3.0.0 - 3.0.6+
 * Engine: MZ only
 * 
 * Note: Different from NuunSaveScreenTranslator which handles an earlier version
 * with different method names and parameter structure.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

export class NuunSaveScreen3Translator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'NUUN_SaveScreen_3';
    }

    getPluginLabel() {
        return 'NUUN SaveScreen 3';
    }

    getCacheType() {
        return 'plugin_nuun_save_screen_3';
    }

    enablePluginTranslation() {
        return this._hookDrawSystemText();
    }

    /**
     * Hook Window_SavefileList.prototype.drawSystemText to translate ParamName labels
     * @private
     */
    _hookDrawSystemText() {
        if (
            !window.Window_SavefileList?.prototype ||
            typeof window.Window_SavefileList.prototype.drawSystemText !== 'function'
        ) {
            return false;
        }

        const cacheType = this.getCacheType();
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        const original = window.Window_SavefileList.prototype.drawSystemText;

        window.Window_SavefileList.prototype.drawSystemText = function (x, y, width, data) {
            let effectiveName = data?.ParamName;

            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    isUsableText(effectiveName)
                ) {
                    const cacheKey = runtime.getCacheKey(effectiveName, cacheType);
                    runtime.trackCacheKeyUsage(cacheKey);

                    if (runtime.hasUsableCacheValue(cacheKey)) {
                        const cached = runtime.translationCache.get(cacheKey);
                        if (isUsableText(cached)) {
                            effectiveName = cached;
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    '[NuunSaveScreen3Translator] Failed to apply cached ParamName translation',
                    error
                );
            }

            // Call original with effective name by modifying data temporarily
            const originalName = data?.ParamName;
            if (data && effectiveName !== originalName) {
                data.ParamName = effectiveName;
                const result = original.call(this, x, y, width, data);
                data.ParamName = originalName;
                return result;
            }

            return original.call(this, x, y, width, data);
        };

        return true;
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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[NuunSaveScreen3Translator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        this.collectParamNamesFromPluginParams(entries);

        return entries;
    }

    /**
     * Collect ParamName labels from plugin parameters (SaveLayout.SaveMainWindowList.ContentsList)
     * @private
     */
    collectParamNamesFromPluginParams(output) {
        if (!Array.isArray(output)) {
            return;
        }

        try {
            const parameters = this._resolvePluginParameters();
            if (!parameters) {
                return;
            }

            const saveLayout = this._extractSaveLayout(parameters);
            if (!saveLayout) {
                return;
            }

            this._collectParamNamesFromMainWindow(saveLayout, output);
            this._collectParamNamesFromStatusWindow(saveLayout, output);
        } catch (error) {
            console.warn('[NuunSaveScreen3Translator] Failed to scan param names', error);
        }
    }

    /**
     * Resolve plugin parameters from runtime or plugin entry
     * @private
     */
    _resolvePluginParameters() {
        if (
            window.PluginManager &&
            typeof window.PluginManager.parameters === 'function'
        ) {
            const params = window.PluginManager.parameters(this.getPluginName());
            if (params && typeof params === 'object') {
                return params;
            }
        }

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            return pluginEntry.parameters;
        }

        return null;
    }

    /**
     * Parse JSON-like value that may be nested as stringified structs
     * @private
     */
    _parseDeepJson(value, fallback = null) {
        let current = value;
        for (let depth = 0; depth < 4; depth++) {
            if (typeof current !== 'string') {
                break;
            }
            const trimmed = current.trim();
            if (!trimmed) {
                return fallback;
            }
            const parsed = parseJsonSafely(trimmed, current);
            if (parsed === current) {
                break;
            }
            current = parsed;
        }

        return current ?? fallback;
    }

    /**
     * Parse plugin struct arrays where each element may be a stringified object
     * @private
     */
    _parseStructArray(rawValue) {
        const parsed = this._parseDeepJson(rawValue, null);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((entry) => this._parseDeepJson(entry, null))
            .filter((entry) => entry && typeof entry === 'object');
    }

    /**
     * Normalize quoted token values like "'Default'"
     * @private
     */
    _normalizeToken(value) {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) {
            return '';
        }
        return text.replace(/^['"]+|['"]+$/g, '');
    }

    /**
     * Decode nested SaveLayout fields used for labels
     * @private
     */
    _decodeLayout(layout) {
        if (!layout || typeof layout !== 'object') {
            return null;
        }

        const decodedLayout = { ...layout };

        const mainWindow = this._parseDeepJson(decodedLayout.SaveMainWindowList, null);
        if (!mainWindow || typeof mainWindow !== 'object') {
            return null;
        }
        decodedLayout.SaveMainWindowList = {
            ...mainWindow,
            ContentsList: this._parseStructArray(mainWindow.ContentsList),
        };

        decodedLayout.SaveStatusWindowList = this._parseStructArray(
            decodedLayout.SaveStatusWindowList
        );

        for (let page = 1; page <= 10; page++) {
            const pageKey = `PageList${page}`;
            decodedLayout[pageKey] = this._parseStructArray(decodedLayout[pageKey]);
        }

        return decodedLayout;
    }

    /**
     * Extract and decode active SaveLayout from plugin parameters
     * @private
     */
    _extractSaveLayout(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return null;
        }

        const layouts = this._parseStructArray(parameters.SaveLayout);
        if (!layouts.length) {
            return null;
        }

        const preferredStyle = this._normalizeToken(parameters.SaveLayoutStyle);
        const activeLayout = preferredStyle
            ? layouts.find(
                (layout) =>
                    this._normalizeToken(layout?.StyleName) === preferredStyle
            ) || layouts[0]
            : layouts[0];

        return this._decodeLayout(activeLayout);
    }

    /**
     * Collect ParamName from SaveMainWindowList.ContentsList
     * @private
     */
    _collectParamNamesFromMainWindow(saveLayout, output) {
        const contentsList = saveLayout?.SaveMainWindowList?.ContentsList;
        if (!Array.isArray(contentsList)) {
            return;
        }

        for (const item of contentsList) {
            const paramName = item?.ParamName;
            if (this.isUsableText(paramName)) {
                output.push({
                    text: paramName,
                    source: {
                        scope: 'pluginParam',
                        param: 'SaveLayout.SaveMainWindowList.ContentsList.ParamName',
                    },
                });
            }
        }
    }

    /**
     * Collect ParamName from SaveStatusWindowList.*.PageList*
     * @private
     */
    _collectParamNamesFromStatusWindow(saveLayout, output) {
        const statusWindowList = saveLayout?.SaveStatusWindowList;
        if (!Array.isArray(statusWindowList)) {
            return;
        }

        for (const statusWindow of statusWindowList) {
            const listDateSetting = statusWindow?.ListDateSetting;
            if (!listDateSetting) {
                continue;
            }

            const pageListKey = `PageList${listDateSetting}`;
            const pageList = saveLayout[pageListKey];
            if (!Array.isArray(pageList)) {
                continue;
            }

            for (const item of pageList) {
                const paramName = item?.ParamName;
                if (this.isUsableText(paramName)) {
                    output.push({
                        text: paramName,
                        source: {
                            scope: 'pluginParam',
                            param: `SaveLayout.${pageListKey}.ParamName`,
                        },
                    });
                }
            }
        }
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_nuun_save_screen_3_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

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
