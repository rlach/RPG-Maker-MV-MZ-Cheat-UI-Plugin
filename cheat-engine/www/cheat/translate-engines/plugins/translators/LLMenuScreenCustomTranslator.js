import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const CACHE_TYPE = 'plugin_ll_menu_screen';
const DEBUG_TAG = '[LLMenuScreenTranslator]';

// Plugin names: the Base plugin holds the picture list; Custom holds the menu layout + help texts.
// Detection is keyed to Custom variants because translatable parameter surfaces live there.
// MV variants use the same names with an 'MV' suffix; parameter structure is identical.
const PLUGIN_NAME_CUSTOM = 'LL_MenuScreenCustom';
const PLUGIN_NAME_CUSTOM_MV = 'LL_MenuScreenCustomMV';

// Static label fields in LL_MenuScreenCustom that may contain Japanese text.
const LABEL_PARAM_FIELDS = [
    'leftBlockLabel',
    'rightBlockLabel',
    'rightBottomBlockLabel',
    'leftBottomBlockLabel',
];

/**
 * LLMenuScreenCustomTranslator
 *
 * Translator for LL_MenuScreenBase + LL_MenuScreenCustom plugin pair.
 *
 * Supported versions:
 * - LL_MenuScreenCustom / LL_MenuScreenBase (MZ, version not specified in source)
 * - LL_MenuScreenCustomMV v1.4.4 / LL_MenuScreenBaseMV v1.1.0 (MV)
 *
 * Translatable surfaces:
 * - menuHelpTexts[].helpText in plugin parameters
 * - leftBlockLabel, rightBlockLabel, rightBottomBlockLabel, leftBottomBlockLabel
 *
 * Runtime behavior:
 * - Re-resolves menu help text when command display names are translated.
 * - Hooks Window_MenuHelp instance drawText to translate known static labels.
 */
export class LLMenuScreenCustomTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME_CUSTOM;
    }

    getPluginAliases() {
        return [this.getPluginName(), PLUGIN_NAME_CUSTOM_MV];
    }

    getPluginLabel() {
        return 'LL MenuScreenCustom';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    _findCustomPluginEntry() {
        return (
            this.findPluginEntry(PLUGIN_NAME_CUSTOM) || this.findPluginEntry(PLUGIN_NAME_CUSTOM_MV)
        );
    }

    /**
     * Parse the menuHelpTexts plugin parameter into an array of {symbol, helpText} objects.
     * Each array element in the raw JSON is a serialized JSON string.
     */
    _parseMenuHelpTexts(parameters) {
        const parsed = parseJsonSafely(parameters?.menuHelpTexts, []);

        if (!Array.isArray(parsed)) {
            return [];
        }

        const result = [];
        for (const item of parsed) {
            const entry = parseJsonSafely(item, null);
            if (entry && typeof entry === 'object') {
                result.push(entry);
            }
        }

        return result;
    }

    _appendEntriesFromParameters(parameters, output) {
        // Collect menuHelpTexts[].helpText values (the descriptions).
        // The symbol values are command display names handled by the command translation system.
        const menuHelpTexts = this._parseMenuHelpTexts(parameters);
        for (let i = 0; i < menuHelpTexts.length; i++) {
            const item = menuHelpTexts[i];
            const helpText = typeof item.helpText === 'string' ? item.helpText.trim() : '';
            const symbol = typeof item.symbol === 'string' ? item.symbol.trim() : '';
            if (helpText) {
                output.push({ text: helpText, source: { field: 'helpText', symbol, index: i } });
            }
        }

        // Collect static UI label strings.
        for (const field of LABEL_PARAM_FIELDS) {
            const text = parameters[field]?.trim() ?? '';
            if (text) {
                output.push({ text, source: { field } });
            }
        }
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
                console.warn('[LLMenuScreenTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const plugin = this._findCustomPluginEntry();
        if (!plugin?.parameters) {
            return entries;
        }

        this._appendEntriesFromParameters(plugin.parameters, entries);
        return entries;
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_ll_menu_screen_${byCacheKey.size}`,
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

    translatedValues = new Set();

    enablePluginTranslation() {
        const customPlugin = this._findCustomPluginEntry();
        if (!customPlugin?.parameters) {
            console.log(
                '[LLMenuScreenCustomTranslator] Failed to find plugin parameters for hooking',
                customPlugin
            );
            return false;
        }

        const sceneMenuPrototype = window.Scene_Menu?.prototype;
        if (!sceneMenuPrototype) {
            console.log('[LLMenuScreenCustomTranslator] Scene_Menu prototype not found');
            return false;
        }

        if (typeof sceneMenuPrototype.update !== 'function') {
            console.log('[LLMenuScreenCustomTranslator] Scene_Menu.prototype.update not found');
            return false;
        }

        if (typeof sceneMenuPrototype.createMenuHelpWindow !== 'function') {
            console.log(
                '[LLMenuScreenCustomTranslator] Scene_Menu.prototype.createMenuHelpWindow not found'
            );
            return false;
        }

        const menuHelpTexts = this._parseMenuHelpTexts(customPlugin.parameters);
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        // Build a map from original command display name (symbol) → original helpText.
        // This allows us to find the correct helpText when given a (possibly translated)
        // command name at runtime.
        const symbolToOriginalHelpText = new Map();
        for (const item of menuHelpTexts) {
            const symbol = typeof item.symbol === 'string' ? item.symbol.trim() : '';
            const helpText = typeof item.helpText === 'string' ? item.helpText.trim() : '';
            if (symbol && helpText) {
                symbolToOriginalHelpText.set(symbol, helpText);
            }
        }

        /**
         * Translate a single string from the plugin_ll_menu_screen cache.
         * Marks the key as seen. Returns the original text if no cached translation exists.
         */
        const resolveFromCache = (originalText, runtime) => {
            if (!isUsableText(originalText)) {
                return originalText;
            }

            if (this.translatedValues.has(originalText)) {
                return originalText;
            }
            console.log('[LLMenuScreenCustomTranslator] Resolving from cache:', originalText);
            const direct = resolveRuntimeTranslation(originalText, runtime, CACHE_TYPE, {
                missValue: originalText,
            });

            if (direct !== originalText) {
                this.translatedValues.add(direct);
                return direct;
            }

            const trimmed = originalText.trim();
            if (!trimmed || trimmed === originalText) {
                return originalText;
            }

            if (this.translatedValues.has(trimmed)) {
                return originalText;
            }

            const trimmedResolved = resolveRuntimeTranslation(trimmed, runtime, CACHE_TYPE, {
                missValue: trimmed,
                harvestMissing: false,
            });
            if (trimmedResolved === trimmed) {
                this.translatedValues.add(trimmed);
                return originalText;
            }

            const leading = originalText.match(/^\s*/)?.[0] || '';
            const trailing = originalText.match(/\s*$/)?.[0] || '';
            return `${leading}${trimmedResolved}${trailing}`;
        };

        /**
         * Resolve the translated help text for a command given its current display name,
         * which may already be in the target language.
         *
         * Strategy:
         *   1. Direct lookup: currentName is still the original Japanese symbol → use directly.
         *   2. Reverse lookup: currentName is a translated command name → scan the command
         *      cache to find which original symbol translated to this name, then use that symbol.
         *   3. If no match is found, return null (let the existing LL result stand).
         */
        const resolveHelpText = (currentName, runtime) => {
            if (!isUsableText(currentName)) {
                return null;
            }

            // Strategy 1: direct match (command name was not translated or matches as-is).
            if (symbolToOriginalHelpText.has(currentName)) {
                const originalHelpText = symbolToOriginalHelpText.get(currentName);
                return resolveFromCache(originalHelpText, runtime);
            }

            // Strategy 2: reverse-lookup through the command translation cache.
            for (const [originalSymbol, originalHelpText] of symbolToOriginalHelpText) {
                const canonicalSymbol =
                    typeof runtime.getCanonicalSystemCommandName === 'function'
                        ? runtime.getCanonicalSystemCommandName(originalSymbol)
                        : originalSymbol;

                const translatedSymbol = resolveRuntimeTranslation(
                    canonicalSymbol,
                    runtime,
                    'command',
                    {
                        missValue: canonicalSymbol,
                        harvestMissing: false,
                    }
                );

                if (translatedSymbol === currentName) {
                    return resolveFromCache(originalHelpText, runtime);
                }
            }

            return null;
        };

        // ---------------------------------------------------------------------------
        // Hook 1: Fix the menuHelpLists lookup and apply translated help text.
        //
        // LL_MenuScreenCustom patches Scene_Menu.prototype.update to look up the help
        // text using the current command's display name as a key into its internal
        // menuHelpLists map (closed over, not accessible externally). When command
        // names are translated in-place by applyTranslationsToCommands, the lookup
        // produces an empty string. We re-run the lookup via our own map and override
        // the Window_MenuHelp text after LL's update has run.
        // ---------------------------------------------------------------------------
        const originalUpdate = sceneMenuPrototype.update;

        sceneMenuPrototype.update = function () {
            originalUpdate.call(this);

            try {
                if (!this._menuHelpWindow || !this._commandWindow) {
                    return;
                }

                const runtime = getRuntime();
                if (!runtime || !isRuntimeTranslationActive(runtime)) {
                    return;
                }

                const currentName = this._commandWindow.currentName();
                if (!currentName) {
                    return;
                }

                const translatedHelpText = resolveHelpText(currentName, runtime);
                if (translatedHelpText !== null) {
                    this._menuHelpWindow.setText(translatedHelpText);
                }
            } catch (error) {
                console.warn(
                    '[LLMenuScreenTranslator] Failed to apply help text translation',
                    error
                );
            }
        };

        // ---------------------------------------------------------------------------
        // Hook 2: Translate label strings in the Window_MenuHelp instance.
        //
        // Window_MenuHelp is defined inside the LL plugin's IIFE and is not exposed
        // globally, so we cannot patch its prototype directly. Instead, we patch
        // Scene_Menu.prototype.createMenuHelpWindow to intercept the newly created
        // instance and override drawText on it. Only strings present in the
        // plugin_ll_menu_screen cache will be translated; dynamic values like the
        // current map name or playtime text are not in the cache and pass through.
        //
        // Known limitation: measureTextWidth calls inside drawLeftBlock/drawRightBlock
        // use the original (untranslated) label text for positioning the adjacent value
        // text. If translated labels differ significantly in length, slight layout drift
        // may occur.
        // ---------------------------------------------------------------------------
        const originalCreate = sceneMenuPrototype.createMenuHelpWindow;
        sceneMenuPrototype.createMenuHelpWindow = function () {
            originalCreate.call(this);

            try {
                const win = this._menuHelpWindow;
                if (!win) {
                    console.debug(`${DEBUG_TAG} createMenuHelpWindow: no _menuHelpWindow instance`);
                    return;
                }

                const protoDrawText = Object.getPrototypeOf(win).drawText;
                if (typeof protoDrawText !== 'function') {
                    console.debug(
                        `${DEBUG_TAG} createMenuHelpWindow: drawText missing on Window_MenuHelp prototype`
                    );
                    return;
                }

                console.debug(
                    `${DEBUG_TAG} createMenuHelpWindow: instance drawText hook installed`
                );

                win.drawText = function (text, x, y, maxWidth, align) {
                    let resolved = text;
                    try {
                        if (typeof text === 'string' && text.trim()) {
                            const runtime = getRuntime();
                            if (runtime && isRuntimeTranslationActive(runtime)) {
                                // Resolve from plugin-specific cache only; keep misses unchanged.
                                resolved = resolveRuntimeTranslation(text, runtime, CACHE_TYPE, {
                                    missValue: text,
                                    harvestMissing: false,
                                });
                                if (resolved === text) {
                                    resolved = resolveFromCache(text, runtime);
                                }
                            }
                        }
                    } catch (error) {
                        console.warn(
                            '[LLMenuScreenTranslator] Failed to translate label text',
                            error
                        );
                    }

                    return protoDrawText.call(this, resolved, x, y, maxWidth, align);
                };
            } catch (error) {
                console.warn(
                    '[LLMenuScreenTranslator] Failed to patch Window_MenuHelp instance',
                    error
                );
            }
        };

        // Fallback path for MV: intercept Window_MenuHelp label draws even when
        // Scene_Menu instance patch does not execute in a particular flow.
        const windowBasePrototype = window.Window_Base?.prototype;
        if (!windowBasePrototype || typeof windowBasePrototype.drawText !== 'function') {
            return false;
        }

        if (!windowBasePrototype.__llMenuScreenWindowBaseLabelHookApplied) {
            const originalWindowBaseDrawText = windowBasePrototype.drawText;
            windowBasePrototype.drawText = function (text, x, y, maxWidth, align) {
                let resolved = text;
                try {
                    const ctorName = this?.constructor?.name || '';
                    if (ctorName === 'Window_MenuHelp' && typeof text === 'string' && text.trim()) {
                        const runtime = getRuntime();
                        if (runtime && isRuntimeTranslationActive(runtime)) {
                            resolved = resolveRuntimeTranslation(text, runtime, CACHE_TYPE, {
                                missValue: text,
                                harvestMissing: false,
                            });
                            if (resolved === text) {
                                resolved = resolveFromCache(text, runtime);
                            }
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[LLMenuScreenTranslator] Window_Base drawText fallback failed',
                        error
                    );
                }

                return originalWindowBaseDrawText.call(this, resolved, x, y, maxWidth, align);
            };

            Object.defineProperty(windowBasePrototype, '__llMenuScreenWindowBaseLabelHookApplied', {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });

            console.debug(`${DEBUG_TAG} Window_Base drawText fallback hook installed`);
        }

        return true;
    }
}
