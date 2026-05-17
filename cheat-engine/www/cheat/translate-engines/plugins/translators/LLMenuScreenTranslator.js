import { BasePluginTranslator } from '../BasePluginTranslator.js';

const CACHE_TYPE = 'plugin_ll_menu_screen';

// Plugin names: the Base plugin holds the picture list; Custom holds the menu layout + help texts.
// We detect by either, but read params from Custom.
// MV variants use the same names with an 'MV' suffix; parameter structure is identical.
const PLUGIN_NAME_CUSTOM = 'LL_MenuScreenCustom';
const PLUGIN_NAME_BASE = 'LL_MenuScreenBase';
const PLUGIN_NAME_CUSTOM_MV = 'LL_MenuScreenCustomMV';
const PLUGIN_NAME_BASE_MV = 'LL_MenuScreenBaseMV';

// Static label fields in LL_MenuScreenCustom that may contain Japanese text.
const LABEL_PARAM_FIELDS = [
    'leftBlockLabel',
    'rightBlockLabel',
    'rightBottomBlockLabel',
    'leftBottomBlockLabel',
];

/**
 * Translator for the LL_MenuScreenBase + LL_MenuScreenCustom plugin pair.
 *
 * Translatable strings:
 *   - menuHelpTexts[].helpText — descriptions shown when a menu command is selected.
 *   - leftBlockLabel, rightBlockLabel, rightBottomBlockLabel, leftBottomBlockLabel — UI labels.
 *
 * The main menu command list is already handled by the command translation system.
 * LL_MenuScreenCustom looks up help text by the *display name* of the currently selected
 * command (via Window_Command.prototype.currentName). When command names are translated,
 * this lookup fails because the menuHelpLists keys are the original Japanese names.
 * This translator patches Scene_Menu.prototype.update to fix that lookup using the
 * command translation cache for reverse resolution.
 *
 * Label strings inside Window_MenuHelp are drawn via drawText calls inside the plugin's
 * IIFE closure. We patch drawText on the Window_MenuHelp instance level (via the
 * createMenuHelpWindow hook) to intercept and translate known label strings at draw time.
 * Layout positions based on measureTextWidth remain on the original label; the text is
 * translated within the measured slot. This may cause minor positional drift for labels
 * that differ significantly in length, which is acceptable.
 */
export class LLMenuScreenTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME_CUSTOM;
    }

    getPluginLabel() {
        return 'LL MenuScreen (help texts + labels)';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    detectPlugin() {
        if (!Array.isArray(window.$plugins)) {
            return false;
        }

        const lowerCustom = PLUGIN_NAME_CUSTOM.toLowerCase();
        const lowerBase = PLUGIN_NAME_BASE.toLowerCase();
        const lowerCustomMV = PLUGIN_NAME_CUSTOM_MV.toLowerCase();
        const lowerBaseMV = PLUGIN_NAME_BASE_MV.toLowerCase();

        return window.$plugins.some((plugin) => {
            if (!plugin || typeof plugin.name !== 'string') {
                return false;
            }

            const lower = plugin.name.trim().toLowerCase();
            return (
                lower === lowerCustom ||
                lower === lowerBase ||
                lower === lowerCustomMV ||
                lower === lowerBaseMV
            );
        });
    }

    _findCustomPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const lowerCustom = PLUGIN_NAME_CUSTOM.toLowerCase();
        const lowerCustomMV = PLUGIN_NAME_CUSTOM_MV.toLowerCase();

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }
                const lower = plugin.name.trim().toLowerCase();
                return lower === lowerCustom || lower === lowerCustomMV;
            }) || null
        );
    }

    /**
     * Parse the menuHelpTexts plugin parameter into an array of {symbol, helpText} objects.
     * Each array element in the raw JSON is a serialized JSON string.
     */
    _parseMenuHelpTexts(parameters) {
        const raw = typeof parameters.menuHelpTexts === 'string' ? parameters.menuHelpTexts : '[]';

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }

        if (!Array.isArray(parsed)) {
            return [];
        }

        const result = [];
        for (const item of parsed) {
            try {
                const entry = typeof item === 'string' ? JSON.parse(item) : item;
                if (entry && typeof entry === 'object') {
                    result.push(entry);
                }
            } catch {
                // skip malformed entry
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

        this._scanPromise = this._buildScanEntries()
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

    async _buildScanEntries() {
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
            if (!text?.trim()) {
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

    countPluginAmountSync({ runtime }) {
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
        const plugin = this._findCustomPluginEntry();
        if (!plugin?.parameters) {
            return false;
        }

        const menuHelpTexts = this._parseMenuHelpTexts(plugin.parameters);
        const knownSourceTexts = new Set();

        // Build a map from original command display name (symbol) → original helpText.
        // This allows us to find the correct helpText when given a (possibly translated)
        // command name at runtime.
        const symbolToOriginalHelpText = new Map();
        for (const item of menuHelpTexts) {
            const symbol = typeof item.symbol === 'string' ? item.symbol.trim() : '';
            const helpText = typeof item.helpText === 'string' ? item.helpText.trim() : '';
            if (symbol && helpText) {
                symbolToOriginalHelpText.set(symbol, helpText);
                knownSourceTexts.add(helpText);
            }
        }

        for (const field of LABEL_PARAM_FIELDS) {
            const text = plugin.parameters[field]?.trim() ?? '';
            if (text) {
                knownSourceTexts.add(text);
            }
        }

        // Attach translator accessor callbacks on Scene_Menu.prototype via non-enumerable
        // properties so that patched methods can reach translator APIs without capturing `this`.
        if (window.Scene_Menu?.prototype) {
            Object.defineProperty(Scene_Menu.prototype, '_llMenuScreenGetRuntime', {
                value: () => this.getRuntime(),
                configurable: true,
                enumerable: false,
                writable: true,
            });
            Object.defineProperty(Scene_Menu.prototype, '_llMenuScreenIsActive', {
                value: (runtime) => this.isRuntimeTranslationActive(runtime),
                configurable: true,
                enumerable: false,
                writable: true,
            });
        }

        /**
         * Translate a single string from the plugin_ll_menu_screen cache.
         * Marks the key as seen. Returns the original text if no cached translation exists.
         */
        const resolveFromCache = (originalText, runtime) => {
            if (!originalText?.trim()) {
                return originalText;
            }

            const cacheKey = runtime.getCacheKey(originalText, CACHE_TYPE);
            runtime.trackCacheKeyUsage(cacheKey);

            if (!runtime.hasUsableCacheValue(cacheKey)) {
                return originalText;
            }

            const cached = runtime.translationCache.get(cacheKey);
            return typeof cached === 'string' && cached.trim() ? cached : originalText;
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
            if (!currentName?.trim()) {
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

                const commandCacheKey = runtime.getCacheKey(canonicalSymbol, 'command');
                const translatedSymbol = runtime.translationCache.get(commandCacheKey);

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
        if (window.Scene_Menu?.prototype) {
            const originalUpdate = Scene_Menu.prototype.update;

            Scene_Menu.prototype.update = function () {
                originalUpdate.call(this);

                try {
                    if (!this._menuHelpWindow || !this._commandWindow) {
                        return;
                    }

                    const runtime = this._llMenuScreenGetRuntime?.();
                    if (!runtime || !this._llMenuScreenIsActive?.(runtime)) {
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
        }

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
        const originalCreate = Scene_Menu.prototype.createMenuHelpWindow;

        if (typeof originalCreate === 'function') {
            Scene_Menu.prototype.createMenuHelpWindow = function () {
                originalCreate.call(this);

                try {
                    const win = this._menuHelpWindow;
                    if (!win) {
                        return;
                    }

                    const protoDrawText = Object.getPrototypeOf(win).drawText;
                    if (typeof protoDrawText !== 'function') {
                        return;
                    }

                    const getRuntime = this._llMenuScreenGetRuntime;
                    const isActive = this._llMenuScreenIsActive;

                    win.drawText = function (text, x, y, maxWidth, align) {
                        let resolved = text;
                        try {
                            if (typeof text === 'string' && text.trim()) {
                                const runtime = getRuntime?.();
                                if (runtime && isActive?.(runtime) && knownSourceTexts.has(text)) {
                                    resolved = resolveFromCache(text, runtime);
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
        }
        return true;
    }
}
