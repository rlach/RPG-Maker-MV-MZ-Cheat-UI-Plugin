import { BasePluginTranslator } from '../BasePluginTranslator.js';

const CACHE_TYPE = 'plugin_nrp_map_travel';
const DEFAULT_MENU_SYMBOL = 'maptravel';
const ANY_WINDOW = /** @type {any} */ (window);
const DEBUG_FLAG_NAME = '__CHEAT_DEBUG_NRP_MAP_TRAVEL_TRANSLATOR';

function isDebugEnabled() {
    // Enabled by default while investigating this issue.
    return ANY_WINDOW[DEBUG_FLAG_NAME] !== false;
}

function debugLog(message, payload) {
    if (!isDebugEnabled()) {
        return;
    }

    if (payload !== undefined) {
        console.warn(`[NrpMapTravelTranslator] ${message}`, payload);
        return;
    }

    console.warn(`[NrpMapTravelTranslator] ${message}`);
}

function previewText(value, max = 80) {
    return String(value || '')
        .replaceAll('\n', String.raw`\n`)
        .slice(0, max);
}

function isUsableText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function parseJsonSafely(value, fallback) {
    if (typeof value !== 'string') {
        return value ?? fallback;
    }

    const normalized = value.trim();
    if (!normalized) {
        return fallback;
    }

    try {
        return JSON.parse(normalized);
    } catch {
        return fallback;
    }
}

function parseStructArray(rawValue) {
    const result = [];
    const parsedArray = parseJsonSafely(rawValue, []);
    if (!Array.isArray(parsedArray)) {
        return result;
    }

    for (const entry of parsedArray) {
        if (typeof entry === 'string') {
            const parsedEntry = parseJsonSafely(entry, null);
            if (parsedEntry && typeof parsedEntry === 'object' && !Array.isArray(parsedEntry)) {
                result.push(parsedEntry);
            }
            continue;
        }

        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            result.push(entry);
        }
    }

    return result;
}

function resolveRuntime() {
    const ensureRuntime = ANY_WINDOW.__ensureTranslationRuntime;
    if (typeof ensureRuntime === 'function') {
        return ensureRuntime();
    }

    return ANY_WINDOW.__TranslationRuntime || null;
}

function isRuntimeTranslationActive(runtime) {
    if (!runtime) {
        return false;
    }

    const translationEnabled =
        typeof runtime.isTranslationEnabled === 'function'
            ? !!runtime.isTranslationEnabled()
            : !!runtime.enabled;

    return translationEnabled || !!runtime.translateCacheWhenDisabled;
}

export class NrpMapTravelTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._lastObservedSceneCtorName = '';
    }

    getPluginName() {
        return 'NRP_MapTravel';
    }

    getPluginLabel() {
        return 'NRP MapTravel';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = String(this.getPluginName() || '')
            .trim()
            .toLowerCase();
        if (!pluginName) {
            return null;
        }

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === pluginName;
            }) || null
        );
    }

    resolveMenuSymbol(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return DEFAULT_MENU_SYMBOL;
        }

        const symbol = String(parameters.TravelSymbol || '').trim();
        return symbol || DEFAULT_MENU_SYMBOL;
    }

    getRuntimeParameters() {
        const pluginManager = ANY_WINDOW.PluginManager;
        if (pluginManager && typeof pluginManager.parameters === 'function') {
            return pluginManager.parameters(this.getPluginName()) || null;
        }

        return null;
    }

    getConfiguredMenuSymbol() {
        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters && typeof runtimeParameters === 'object') {
            return this.resolveMenuSymbol(runtimeParameters);
        }

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry && pluginEntry.parameters) {
            return this.resolveMenuSymbol(pluginEntry.parameters);
        }

        return DEFAULT_MENU_SYMBOL;
    }

    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        if (isUsableText(parameters.TravelName)) {
            output.push({
                text: parameters.TravelName,
                cacheType: 'command',
                source: {
                    scope,
                    field: 'TravelName',
                    mirrorType: 'command',
                },
            });
        }

        const spots = parseStructArray(parameters.SpotList);
        for (let spotIndex = 0; spotIndex < spots.length; spotIndex++) {
            const spot = spots[spotIndex];

            if (isUsableText(spot.SpotName)) {
                output.push({
                    text: spot.SpotName,
                    cacheType: this.getCacheType(),
                    source: {
                        scope,
                        field: 'SpotList',
                        spotIndex,
                        part: 'SpotName',
                    },
                });
            }

            if (isUsableText(spot.Description)) {
                output.push({
                    text: spot.Description,
                    cacheType: this.getCacheType(),
                    source: {
                        scope,
                        field: 'SpotList',
                        spotIndex,
                        part: 'Description',
                    },
                });
            }
        }
    }

    resolveRuntimeTranslation(text, runtime, cacheType) {
        if (!isUsableText(text)) {
            return text;
        }

        if (
            !runtime ||
            typeof runtime.getCacheKey !== 'function' ||
            typeof runtime.hasUsableCacheValue !== 'function' ||
            !(runtime.translationCache instanceof Map)
        ) {
            debugLog('resolveRuntimeTranslation skipped (runtime unavailable)', {
                cacheType,
                text: previewText(text),
                hasRuntime: !!runtime,
            });
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, cacheType);
        debugLog('cache lookup', {
            cacheType,
            cacheKey,
            text: previewText(text),
        });

        if (typeof runtime.markCacheKeySeen === 'function') {
            runtime.markCacheKeySeen(cacheKey);
            debugLog('markCacheKeySeen', { cacheKey, cacheType });
        }

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            debugLog('cache miss', { cacheKey, cacheType, text: previewText(text) });
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        debugLog('cache hit', {
            cacheKey,
            cacheType,
            original: previewText(text),
            translated: previewText(cached),
        });
        return isUsableText(cached) ? cached : text;
    }

    patchSpotListItems(windowInstance, runtime) {
        if (!windowInstance || !Array.isArray(windowInstance._data)) {
            return false;
        }

        let changed = false;

        for (const item of windowInstance._data) {
            changed = this.translateSpotItemInPlace(item, runtime) || changed;
        }

        return changed;
    }

    translateSpotItemInPlace(item, runtime) {
        if (!item || typeof item !== 'object') {
            return false;
        }

        debugLog('translateSpotItemInPlace', {
            spotName: previewText(item.SpotName),
            description: previewText(item.Description || item.description),
        });

        if (!Object.prototype.hasOwnProperty.call(item, '__CHEAT_ORIGINAL_SPOT_NAME__')) {
            Object.defineProperty(item, '__CHEAT_ORIGINAL_SPOT_NAME__', {
                value: typeof item.SpotName === 'string' ? item.SpotName : '',
                configurable: true,
                enumerable: false,
                writable: true,
            });
        }

        if (!Object.prototype.hasOwnProperty.call(item, '__CHEAT_ORIGINAL_SPOT_DESCRIPTION__')) {
            const descriptionSource =
                typeof item.Description === 'string'
                    ? item.Description
                    : typeof item.description === 'string'
                      ? item.description
                      : '';

            Object.defineProperty(item, '__CHEAT_ORIGINAL_SPOT_DESCRIPTION__', {
                value: descriptionSource,
                configurable: true,
                enumerable: false,
                writable: true,
            });
        }

        const translatedSpotName = this.resolveRuntimeTranslation(
            item.__CHEAT_ORIGINAL_SPOT_NAME__,
            runtime,
            this.getCacheType()
        );
        let changed = false;
        if (item.SpotName !== translatedSpotName) {
            changed = true;
        }
        item.SpotName = translatedSpotName;

        const translatedDescription = this.resolveRuntimeTranslation(
            item.__CHEAT_ORIGINAL_SPOT_DESCRIPTION__,
            runtime,
            this.getCacheType()
        );

        if (item.Description !== translatedDescription || item.description !== translatedDescription) {
            changed = true;
        }

        item.Description = translatedDescription;
        item.description = translatedDescription;
        return changed;
    }

    isMapTravelSelectWindowInstance(windowInstance) {
        if (!windowInstance || typeof windowInstance !== 'object') {
            return false;
        }

        const ctorName =
            windowInstance.constructor && typeof windowInstance.constructor.name === 'string'
                ? windowInstance.constructor.name
                : '';

        if (ctorName === 'Windows_SelectSpots') {
            debugLog('select window detected by ctor name', { ctorName });
            return true;
        }

        // Fallback for minified/renamed constructor names: detect the plugin's unique API surface.
        const matched =
            typeof windowInstance.makeItemList === 'function' &&
            typeof windowInstance.drawItemName === 'function' &&
            typeof windowInstance.isListingSpot === 'function' &&
            typeof windowInstance.setMapWindow === 'function';

        if (matched) {
            debugLog('select window detected by feature match', { ctorName });
        }

        return matched;
    }

    patchSelectWindowInstance(windowInstance) {
        if (!this.isMapTravelSelectWindowInstance(windowInstance)) {
            return;
        }

        if (windowInstance.__CHEAT_NRP_MAP_TRAVEL_WINDOW_PATCHED__) {
            debugLog('patchSelectWindowInstance skipped (already patched)');
            return;
        }

        const translator = this;
        const originalMakeItemList = windowInstance.makeItemList;
        if (typeof originalMakeItemList !== 'function') {
            debugLog('patchSelectWindowInstance skipped (missing makeItemList)');
            return;
        }

        const originalDrawItemName =
            typeof windowInstance.drawItemName === 'function' ? windowInstance.drawItemName : null;
        const originalUpdateHelp =
            typeof windowInstance.updateHelp === 'function' ? windowInstance.updateHelp : null;
        const originalUpdate =
            typeof windowInstance.update === 'function' ? windowInstance.update : null;

        windowInstance.makeItemList = function () {
            const result = originalMakeItemList.apply(this, arguments);

            try {
                const runtime = resolveRuntime();
                debugLog('hook makeItemList called', {
                    active: isRuntimeTranslationActive(runtime),
                    items: Array.isArray(this._data) ? this._data.length : -1,
                });
                if (!isRuntimeTranslationActive(runtime)) {
                    return result;
                }

                const changed = translator.patchSpotListItems(this, runtime);
                if (changed) {
                    debugLog('makeItemList applied new translations');
                }
            } catch (error) {
                console.warn(
                    '[NrpMapTravelTranslator] Failed to translate map travel spot list entries',
                    error
                );
            }

            return result;
        };

        if (originalDrawItemName) {
            windowInstance.drawItemName = function (item, x, y) {
                try {
                    const runtime = resolveRuntime();
                    debugLog('hook drawItemName called', {
                        active: isRuntimeTranslationActive(runtime),
                        item: previewText(item && item.SpotName),
                    });
                    if (isRuntimeTranslationActive(runtime)) {
                        translator.translateSpotItemInPlace(item, runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[NrpMapTravelTranslator] Failed to translate spot item in drawItemName',
                        error
                    );
                }

                return originalDrawItemName.apply(this, arguments);
            };
        }

        if (originalUpdateHelp) {
            windowInstance.updateHelp = function () {
                try {
                    const runtime = resolveRuntime();
                    debugLog('hook updateHelp called', {
                        active: isRuntimeTranslationActive(runtime),
                    });
                    if (isRuntimeTranslationActive(runtime) && typeof this.item === 'function') {
                        translator.translateSpotItemInPlace(this.item(), runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[NrpMapTravelTranslator] Failed to translate spot item in updateHelp',
                        error
                    );
                }

                return originalUpdateHelp.apply(this, arguments);
            };
        }

        if (originalUpdate) {
            windowInstance.update = function () {
                const result = originalUpdate.apply(this, arguments);

                try {
                    const runtime = resolveRuntime();
                    if (!isRuntimeTranslationActive(runtime)) {
                        return result;
                    }

                    const changed = translator.patchSpotListItems(this, runtime);
                    if (!changed) {
                        return result;
                    }

                    debugLog('update applied delayed translations; refreshing window');

                    if (typeof this.refresh === 'function') {
                        this.refresh();
                    }

                    if (typeof this.callUpdateHelp === 'function') {
                        this.callUpdateHelp();
                    } else if (typeof this.updateHelp === 'function') {
                        this.updateHelp();
                    }
                } catch (error) {
                    console.warn(
                        '[NrpMapTravelTranslator] Failed during delayed translation update',
                        error
                    );
                }

                return result;
            };
        }

        Object.defineProperty(windowInstance, '__CHEAT_NRP_MAP_TRAVEL_WINDOW_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        debugLog('patchSelectWindowInstance installed', {
            ctorName:
                windowInstance.constructor && typeof windowInstance.constructor.name === 'string'
                    ? windowInstance.constructor.name
                    : '(unknown)',
        });
    }

    patchWindowsFromScene(scene, source = 'unknown') {
        if (!scene || typeof scene !== 'object') {
            return;
        }

        const ctorName =
            scene.constructor && typeof scene.constructor.name === 'string'
                ? scene.constructor.name
                : '(unknown-scene)';

        if (this._lastObservedSceneCtorName !== ctorName) {
            this._lastObservedSceneCtorName = ctorName;
            debugLog('observed scene change', { ctorName, source });
        }

        const layer = scene._windowLayer;
        const children = Array.isArray(layer && layer.children) ? layer.children : [];
        for (const child of children) {
            this.patchSelectWindowInstance(child);
        }
    }

    enablePluginTranslation() {
        const translator = this;
        debugLog('enablePluginTranslation start', {
            hasWindowMenuCommand: !!ANY_WINDOW.Window_MenuCommand,
            hasSceneBase: !!ANY_WINDOW.Scene_Base,
        });

        if (
            ANY_WINDOW.Window_MenuCommand &&
            ANY_WINDOW.Window_MenuCommand.prototype &&
            typeof ANY_WINDOW.Window_MenuCommand.prototype.addMainCommands === 'function'
        ) {
            const menuCommandCtor = ANY_WINDOW.Window_MenuCommand;
            const originalAddMainCommands = menuCommandCtor.prototype.addMainCommands;

            menuCommandCtor.prototype.addMainCommands = function () {
                const result = originalAddMainCommands.apply(this, arguments);

                try {
                    const runtime = resolveRuntime();
                    debugLog('hook addMainCommands called', {
                        active: isRuntimeTranslationActive(runtime),
                        listCount: Array.isArray(this._list) ? this._list.length : -1,
                    });
                    if (!isRuntimeTranslationActive(runtime)) {
                        return result;
                    }

                    if (!Array.isArray(this._list)) {
                        return result;
                    }

                    const travelSymbol = translator.getConfiguredMenuSymbol();
                    debugLog('resolving menu command by symbol', { travelSymbol });
                    for (const command of this._list) {
                        if (!command || command.symbol !== travelSymbol) {
                            continue;
                        }

                        if (!isUsableText(command.name)) {
                            continue;
                        }

                        command.name = translator.resolveRuntimeTranslation(
                            command.name,
                            runtime,
                            'command'
                        );
                        debugLog('menu command translated', {
                            symbol: command.symbol,
                            name: previewText(command.name),
                        });
                    }
                } catch (error) {
                    console.warn(
                        '[NrpMapTravelTranslator] Failed to translate map travel menu command',
                        error
                    );
                }

                return result;
            };
        }

        if (
            ANY_WINDOW.Scene_Base &&
            ANY_WINDOW.Scene_Base.prototype &&
            typeof ANY_WINDOW.Scene_Base.prototype.addWindow === 'function'
        ) {
            const sceneBaseCtor = ANY_WINDOW.Scene_Base;
            const originalAddWindow = sceneBaseCtor.prototype.addWindow;

            sceneBaseCtor.prototype.addWindow = function (windowInstance) {
                const result = originalAddWindow.apply(this, arguments);

                try {
                    debugLog('hook addWindow called', {
                        ctorName:
                            windowInstance &&
                            windowInstance.constructor &&
                            typeof windowInstance.constructor.name === 'string'
                                ? windowInstance.constructor.name
                                : '(unknown)',
                    });
                    translator.patchSelectWindowInstance(windowInstance);
                } catch (error) {
                    console.warn(
                        '[NrpMapTravelTranslator] Failed to patch map travel select window instance',
                        error
                    );
                }

                return result;
            };

            debugLog('hook installed: Scene_Base.addWindow');
        }

        if (
            ANY_WINDOW.SceneManager &&
            typeof ANY_WINDOW.SceneManager.updateScene === 'function'
        ) {
            const originalUpdateScene = ANY_WINDOW.SceneManager.updateScene;

            ANY_WINDOW.SceneManager.updateScene = function () {
                const result = originalUpdateScene.apply(this, arguments);

                try {
                    translator.patchWindowsFromScene(this._scene, 'SceneManager.updateScene');
                } catch (error) {
                    console.warn(
                        '[NrpMapTravelTranslator] Failed while patching windows from SceneManager.updateScene',
                        error
                    );
                }

                return result;
            };

            debugLog('hook installed: SceneManager.updateScene');
        }
    }

    async prepareTranslator() {
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
                console.warn('[NrpMapTravelTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.appendEntriesFromParameters(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters && typeof runtimeParameters === 'object') {
            this.appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!isUsableText(text)) {
                continue;
            }

            const cacheType = isUsableText(entry.cacheType) ? entry.cacheType : this.getCacheType();
            const cacheKey = panel.getCacheKey(text, cacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_nrp_map_travel_${cacheType}_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(panel);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}