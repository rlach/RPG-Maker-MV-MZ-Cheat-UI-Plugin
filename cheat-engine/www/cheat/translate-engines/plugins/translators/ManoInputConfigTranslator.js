import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_MANO_INPUT_CONFIG_TRANSLATOR_HOOKED__';

const CACHE_TYPE = 'plugin_mano_input_config';

const STATIC_PLUGIN_TEXTS = ['ボタン表記変更'];

/**
 * Strip outer double-quotes from an RPG Maker note-style string, identical to the
 * plugin's own noteOrString() helper.
 *
 * @param {string} text
 * @returns {string}
 */
function noteOrString(text) {
    if (typeof text !== 'string' || text.length < 2) {
        return typeof text === 'string' ? text : '';
    }

    if (text[0] === '"' && text[text.length - 1] === '"') {
        try {
            return JSON.parse(text);
        } catch (_) {
            // fall through – return raw
        }
    }

    return text;
}

/**
 * Safe JSON.parse – returns null on failure.
 *
 * @param {string} raw
 * @returns {object|null}
 */
function safeJsonParse(raw) {
    if (typeof raw !== 'string' || !raw.trim()) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

/**
 * Extract the JP text from a struct<MultiLangString> parameter value.
 * The raw plugin parameter value is a JSON string like '{"jp":"決定","en":"OK"}'.
 *
 * @param {string} raw
 * @returns {string}
 */
function extractMultiLangString(raw) {
    const obj = safeJsonParse(raw);
    if (!obj) {
        return '';
    }

    return typeof obj.jp === 'string' ? obj.jp : '';
}

/**
 * Extract the JP text from a struct<MultiLangNote> parameter value.
 * The "jp" field inside is a note-wrapped string (may start/end with '"').
 *
 * @param {string} raw
 * @returns {string}
 */
function extractMultiLangNote(raw) {
    const obj = safeJsonParse(raw);
    if (!obj) {
        return '';
    }

    return typeof obj.jp === 'string' ? noteOrString(obj.jp) : '';
}

/**
 * Extract translatable JP strings from a struct<BasicSymbol> parameter value.
 * Returns name, keyText (if non-empty), and helpText (if non-empty).
 *
 * @param {string} raw
 * @returns {{ name: string, keyText: string, helpText: string }}
 */
function extractBasicSymbol(raw) {
    const obj = safeJsonParse(raw);
    if (!obj) {
        return { name: '', keyText: '', helpText: '' };
    }

    const name = typeof obj.name === 'string' ? extractMultiLangString(obj.name) : '';
    const keyText = typeof obj.keyText === 'string' ? extractMultiLangString(obj.keyText) : '';
    const helpText = typeof obj.helpText === 'string' ? extractMultiLangNote(obj.helpText) : '';

    return { name, keyText, helpText };
}

/**
 * Extract the JP text from a struct<KeyconfigCommand> parameter value.
 * The structure is '{"width":"N","text":"{\"jp\":\"...\",\"en\":\"...\"}"}`.
 *
 * @param {string} raw
 * @returns {string}
 */
function extractKeyconfigCommand(raw) {
    const obj = safeJsonParse(raw);
    if (!obj) {
        return '';
    }

    return typeof obj.text === 'string' ? extractMultiLangString(obj.text) : '';
}

export class ManoInputConfigTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'Mano_InputConfig';
    }

    getPluginLabel() {
        return 'Mano_InputConfig';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    /**
     * Resolve a text string through the translation cache.
     * Marks the cache key as seen on every call.
     *
     * @param {string} text
     * @param {object} runtime
     * @returns {string}
     */
    resolveFromCache(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        if (!runtime) {
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, CACHE_TYPE);
        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return this.isUsableText(cached) ? cached : text;
    }

    // ─── Runtime hooks ────────────────────────────────────────────────────────

    _getManoNamespace() {
        const namespaceFromWindow = window['Mano_InputConfig'];
        if (namespaceFromWindow && typeof namespaceFromWindow === 'object') {
            return namespaceFromWindow;
        }

        // Some plugin builds declare global `const Mano_InputConfig` without
        // attaching it to `window`. Resolve it from global script scope.
        try {
            const namespaceFromGlobalConst = window.eval(
                'typeof Mano_InputConfig !== "undefined" ? Mano_InputConfig : null'
            );
            if (namespaceFromGlobalConst && typeof namespaceFromGlobalConst === 'object') {
                return namespaceFromGlobalConst;
            }
        } catch (error) {
            console.warn('[ManoInputConfigTranslator] Failed to resolve Mano_InputConfig', error);
        }

        return null;
    }

    _isMvVersion() {
        const manoNs = this._getManoNamespace();
        // MV exports Window_GamepadConfig directly; MZ does not.
        return !!manoNs?.['Window_GamepadConfig'];
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return true;
        }

        if (!this._hookOptionsCommandName()) {
            return false;
        }

        if (this._isMvVersion()) {
            if (!this._hookMV()) {
                return false;
            }
        } else {
            if (!this._hookKeyConfigDrawCommand() && !this._hookKeyConfigScene()) {
                return false;
            }
            this._hookGamepadConfigScene();
        }

        window[RUNTIME_HOOK_GUARD] = true;
        return true;
    }

    /**
     * Install all runtime translation hooks for the old MV-era version.
     * In this version all relevant classes are exported on the Mano_InputConfig
     * namespace, so we can hook them directly without scene interception.
     */
    _hookMV() {
        const getRuntimeFromTranslator = () => this.getRuntime();
        const isTranslatorUsableText = (text) => this.isUsableText(text);
        const resolveFromTranslatorCache = (text, runtime = getRuntimeFromTranslator()) =>
            this.resolveFromCache(text, runtime);
        const manoNs = this._getManoNamespace();
        if (!manoNs) {
            return false;
        }

        // ── Window_KeyConfig: drawCommand(commandName, rect) ─────────────────
        // Also wraps drawApplyCommand / drawDefaultCommand / drawexitCommand /
        // drawChangeLayoutCommand which call this.drawText(setting.commandText.*,…)
        // directly without going through drawCommand.
        const WindowKeyConfig = manoNs['Window_KeyConfig'];
        if (WindowKeyConfig?.prototype) {
            const kcProto = WindowKeyConfig.prototype;

            if (typeof kcProto.drawCommand === 'function') {
                const origDrawCommand = kcProto.drawCommand;
                kcProto.drawCommand = function (commandName, rect) {
                    let translated = commandName;
                    try {
                        translated = resolveFromTranslatorCache(commandName);
                    } catch (_) {
                        /* noop */
                    }
                    return origDrawCommand.call(this, translated, rect);
                };
            }

            // These helpers bypass drawCommand and write directly with drawText.
            for (const methodName of [
                'drawApplyCommand',
                'drawDefaultCommand',
                'drawexitCommand',
                'drawChangeLayoutCommand',
            ]) {
                if (typeof kcProto[methodName] === 'function') {
                    const origMethod = kcProto[methodName];
                    kcProto[methodName] = function (...args) {
                        const origDrawText = this.drawText;
                        if (typeof origDrawText !== 'function') {
                            return origMethod.call(this, ...args);
                        }
                        const callOriginalDrawText = (text, ...rest) =>
                            Reflect.apply(origDrawText, this, [text, ...rest]);
                        this.drawText = (text, ...rest) => {
                            let translated = text;
                            try {
                                translated = resolveFromTranslatorCache(text);
                            } catch (_) {
                                /* noop */
                            }
                            return callOriginalDrawText(translated, ...rest);
                        };
                        try {
                            return origMethod.call(this, ...args);
                        } finally {
                            this.drawText = origDrawText;
                        }
                    };
                }
            }
        } else {
            return false;
        }

        // ── Window_GamepadConfig: symbolText(index) ──────────────────────────
        // drawItem calls this.symbolText(index) to get the action name string.
        const WindowGamepadConfig = manoNs['Window_GamepadConfig'];
        if (WindowGamepadConfig?.prototype) {
            const proto = WindowGamepadConfig.prototype;

            if (typeof proto.symbolText === 'function') {
                const origSymbolText = proto.symbolText;
                proto.symbolText = function (index) {
                    const text = origSymbolText.call(this, index);
                    try {
                        return resolveFromTranslatorCache(text);
                    } catch (_) {
                        return text;
                    }
                };
            }

            // drawCommand(index) draws command list entries on initial refresh.
            if (typeof proto.drawCommand === 'function') {
                const origGpDrawCommand = proto.drawCommand;
                proto.drawCommand = function (index) {
                    const commandIndex = this.commandIndex(index);
                    const command = this._command && this._command[commandIndex];
                    if (!command) {
                        return origGpDrawCommand.call(this, index);
                    }
                    const origName = command.name;
                    try {
                        command.name = resolveFromTranslatorCache(origName);
                    } catch (_) {
                        /* noop */
                    }
                    try {
                        return origGpDrawCommand.call(this, index);
                    } finally {
                        command.name = origName;
                    }
                };
            }

            // drawApplyCommand / drawDefaultCommand / drawExitCommand bypass
            // drawCommand(index) and read setting.commandText.* directly.
            // Wrap drawText on the instance for the duration of each call.
            for (const methodName of [
                'drawApplyCommand',
                'drawDefaultCommand',
                'drawExitCommand',
            ]) {
                if (typeof proto[methodName] === 'function') {
                    const origMethod = proto[methodName];
                    proto[methodName] = function (...args) {
                        const origDrawText = this.drawText;
                        if (typeof origDrawText !== 'function') {
                            return origMethod.call(this, ...args);
                        }
                        const callOriginalDrawText = (text, ...rest) =>
                            Reflect.apply(origDrawText, this, [text, ...rest]);
                        this.drawText = (text, ...rest) => {
                            let translated = text;
                            try {
                                translated = resolveFromTranslatorCache(text);
                            } catch (_) {
                                /* noop */
                            }
                            return callOriginalDrawText(translated, ...rest);
                        };
                        try {
                            return origMethod.call(this, ...args);
                        } finally {
                            this.drawText = origDrawText;
                        }
                    };
                }
            }
        }

        // ── Scene_GamepadConfig: translate help window text ──────────────────
        // createHelpWindow calls this._helpWindow.setText(createPadinfoText(pad))
        // once. Hook the scene method to re-translate the text that was just set.
        const SceneGamepadConfig = manoNs['Scene_GamepadConfig'];
        if (
            SceneGamepadConfig &&
            SceneGamepadConfig.prototype &&
            typeof SceneGamepadConfig.prototype.createHelpWindow === 'function'
        ) {
            const origCreateHelpWindow = SceneGamepadConfig.prototype.createHelpWindow;
            SceneGamepadConfig.prototype.createHelpWindow = function () {
                origCreateHelpWindow.call(this);
                if (!this._helpWindow) {
                    return;
                }
                try {
                    // After the original call, re-translate whatever text was set.
                    const currentText = this._helpWindow._text || '';
                    if (isTranslatorUsableText(currentText)) {
                        const translated = resolveFromTranslatorCache(currentText);
                        if (translated !== currentText) {
                            this._helpWindow.setText(translated);
                        }
                    }
                } catch (_) {
                    /* noop */
                }
            };
        }

        // ── Window_InputSymbolList: symbolName(index) ────────────────────────
        // drawItem calls this.symbolName(index) to get the display string.
        const WindowInputSymbolList = manoNs['Window_InputSymbolList'];
        if (
            WindowInputSymbolList?.prototype &&
            typeof WindowInputSymbolList.prototype.symbolName === 'function'
        ) {
            const origSymbolName = WindowInputSymbolList.prototype.symbolName;
            WindowInputSymbolList.prototype.symbolName = function (index) {
                const text = origSymbolName.call(this, index);
                try {
                    return resolveFromTranslatorCache(text);
                } catch (_) {
                    return text;
                }
            };
        }
        return true;
    }

    /**
     * Hook Window_Options.prototype.commandName so that the gamepad-config and
     * keyboard-config command labels added by Mano_InputConfig to the Options
     * menu are translated at draw time.
     */
    _hookOptionsCommandName() {
        const getRuntimeFromTranslator = () => this.getRuntime();
        const resolveFromTranslatorCache = (text, runtime = getRuntimeFromTranslator()) =>
            this.resolveFromCache(text, runtime);
        if (
            !window.Window_Options ||
            !Window_Options.prototype ||
            typeof Window_Options.prototype.commandName !== 'function'
        ) {
            return false;
        }

        const original = Window_Options.prototype.commandName;

        Window_Options.prototype.commandName = function (index) {
            const name = original.call(this, index);
            try {
                const runtime = getRuntimeFromTranslator();
                return resolveFromTranslatorCache(name, runtime);
            } catch (error) {
                console.warn(
                    '[ManoInputConfigTranslator] Failed to translate Options commandName',
                    error
                );
            }

            return name;
        };
        return true;
    }

    /**
     * Hook Window_KeyConfig.prototype.drawCommandXX (exported as
     * Mano_InputConfig.Window_KeyConfig) to translate keyboard-config scene
     * command button labels (apply / rollback / reset / exit / WASD etc.).
     */
    _hookKeyConfigDrawCommand() {
        const getRuntimeFromTranslator = () => this.getRuntime();
        const resolveFromTranslatorCache = (text, runtime = getRuntimeFromTranslator()) =>
            this.resolveFromCache(text, runtime);
        const manoNs = this._getManoNamespace();
        if (!manoNs) {
            return false;
        }

        const WindowKeyConfig = manoNs['Window_KeyConfig'];
        if (
            !WindowKeyConfig?.prototype ||
            typeof WindowKeyConfig.prototype.drawCommandXX !== 'function'
        ) {
            return false;
        }

        const original = WindowKeyConfig.prototype.drawCommandXX;

        WindowKeyConfig.prototype.drawCommandXX = function (commandName, rect) {
            let translated = commandName;
            try {
                const runtime = getRuntimeFromTranslator();
                translated = resolveFromTranslatorCache(commandName, runtime);
            } catch (error) {
                console.warn(
                    '[ManoInputConfigTranslator] Failed to translate drawCommandXX',
                    error
                );
            }

            return original.call(this, translated, rect);
        };
        return true;
    }

    _hookKeyConfigScene() {
        const manoNs = this._getManoNamespace();
        if (!manoNs) {
            return false;
        }

        const SceneKeyConfig = manoNs['Scene_KeyConfig'];
        if (typeof SceneKeyConfig?.prototype?.createAllWindows !== 'function') {
            return false;
        }

        const patchSceneWindowDrawText = (scene) => this._patchSceneWindowDrawText(scene);
        const original = SceneKeyConfig.prototype.createAllWindows;

        SceneKeyConfig.prototype.createAllWindows = function () {
            original.call(this);

            try {
                patchSceneWindowDrawText(this);
            } catch (error) {
                console.warn(
                    '[ManoInputConfigTranslator] Failed to patch key config scene windows',
                    error
                );
            }
        };

        return true;
    }

    _patchSceneWindowDrawText(scene) {
        if (!scene || typeof scene !== 'object') {
            return;
        }

        const getRuntimeFromTranslator = () => this.getRuntime();
        const resolveFromTranslatorCache = (text, runtime = getRuntimeFromTranslator()) =>
            this.resolveFromCache(text, runtime);

        for (const key of Object.keys(scene)) {
            if (!key.endsWith('Window')) {
                continue;
            }

            const windowInstance = scene[key];
            if (!windowInstance || typeof windowInstance.drawText !== 'function') {
                continue;
            }

            if (windowInstance['__CHEAT_MANO_DRAWTEXT_PATCHED__']) {
                continue;
            }

            const originalDrawText = windowInstance.drawText;
            windowInstance.drawText = function (text, ...rest) {
                let translated = text;
                try {
                    const runtime = getRuntimeFromTranslator();
                    translated = resolveFromTranslatorCache(text, runtime);
                } catch (error) {
                    console.warn('[ManoInputConfigTranslator] drawText translation failed', error);
                }

                return originalDrawText.call(this, translated, ...rest);
            };

            Object.defineProperty(windowInstance, '__CHEAT_MANO_DRAWTEXT_PATCHED__', {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }
    }

    /**
     * Find the prototype in the chain of `instance` where `methodName` is
     * defined as an own property. Returns null if not found.
     *
     * @param {object} instance
     * @param {string} methodName
     * @returns {object|null}
     */
    _findProtoWithOwn(instance, methodName) {
        let proto = Object.getPrototypeOf(instance);
        while (proto && proto !== Object.prototype) {
            if (Object.prototype.hasOwnProperty.call(proto, methodName)) {
                return proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return null;
    }

    /**
     * Hook Scene_GamepadConfig.prototype.createAllWindows (accessible via the
     * exported Mano_InputConfig.Scene_GamepadConfig) to intercept the two
     * internal window instances and patch their draw methods.
     *
     * Two window prototypes are patched (once each, guarded by a property flag):
     *
     * 1. Window_GamepadConfig_V8 – the upper grid that lists every gamepad button
     *    alongside its assigned action name. `drawItem` calls `item.leftText()`
     *    (button number – untouched) and `item.rigthText()` (":symbolName" for
     *    button items, "" for command items). In addition, command items show
     *    their JP label via `leftText()`. We intercept both texts.
     *
     * 2. Window_InputSymbolList – the lower picker. `drawItem` calls
     *    `drawSymbolObject(item, ...)` which calls `drawText(item.name(), ...)`.
     *    We patch `drawSymbolObject` on the prototype to translate the name.
     */
    _hookGamepadConfigScene() {
        const manoNs = this._getManoNamespace();
        if (!manoNs) {
            return;
        }

        const SceneGamepadConfig = manoNs['Scene_GamepadConfig'];
        if (
            !SceneGamepadConfig ||
            !SceneGamepadConfig.prototype ||
            typeof SceneGamepadConfig.prototype.createAllWindows !== 'function'
        ) {
            return;
        }

        const translator = this;
        const original = SceneGamepadConfig.prototype.createAllWindows;

        SceneGamepadConfig.prototype.createAllWindows = function () {
            original.call(this);

            try {
                translator._patchGamepadWindow(this._gamepadWindow);
            } catch (error) {
                console.warn(
                    '[ManoInputConfigTranslator] Failed to patch gamepad config window',
                    error
                );
            }

            try {
                // The symbol list is stored as _sybmolWindow (note the typo in the plugin)
                translator._patchSymbolListWindow(this._sybmolWindow);
            } catch (error) {
                console.warn(
                    '[ManoInputConfigTranslator] Failed to patch symbol list window',
                    error
                );
            }

            // On first scene open, the original draw happened before patching.
            // Refresh once so translated draw methods take effect immediately.
            try {
                this._gamepadWindow?.refresh?.();
                this._gamepadWindow?.updateHelp?.();

                this._sybmolWindow?.refresh?.();
                this._sybmolWindow?.updateHelp?.();
            } catch (error) {
                console.warn(
                    '[ManoInputConfigTranslator] Failed to refresh patched gamepad config windows',
                    error
                );
            }
        };
    }

    /**
     * Patch `drawItem` on Window_GamepadConfig_V8's prototype so that:
     *  - command left-text labels (e.g. "設定を保存") are translated.
     *  - button right-text ":symbolName" has the symbol name portion translated.
     *
     * @param {object|null} windowInstance
     */
    _patchGamepadWindow(windowInstance) {
        const getRuntimeFromTranslator = () => this.getRuntime();
        const resolveFromTranslatorCache = (text, runtime = getRuntimeFromTranslator()) =>
            this.resolveFromCache(text, runtime);
        if (!windowInstance) {
            return;
        }

        const proto = this._findProtoWithOwn(windowInstance, 'drawItem');
        if (!proto) {
            return;
        }

        if (proto['__CHEAT_MANO_GP_WIN_DRAW_PATCHED__']) {
            return;
        }

        const originalDrawItem = proto.drawItem;

        proto.drawItem = function (index) {
            const item = this.itemAt?.(index) || null;
            if (!item) {
                return originalDrawItem.call(this, index);
            }

            const rawLeft = typeof item.leftText === 'function' ? item.leftText() : null;
            const rawRight = typeof item.rigthText === 'function' ? item.rigthText() : null;

            let patchedLeft = rawLeft;
            let patchedRight = rawRight;

            try {
                const runtime = getRuntimeFromTranslator();

                // Translate command leftText (e.g. "設定を保存", "やめる")
                if (typeof rawLeft === 'string' && rawLeft.trim()) {
                    patchedLeft = resolveFromTranslatorCache(rawLeft, runtime);
                }

                // Translate symbol part of rightText – format is ":symbolName"
                if (typeof rawRight === 'string' && rawRight.startsWith(':')) {
                    const symbolName = rawRight.slice(1);
                    if (symbolName.trim()) {
                        const translated = resolveFromTranslatorCache(symbolName, runtime);
                        patchedRight = ':' + translated;
                    }
                }
            } catch (error) {
                console.warn('[ManoInputConfigTranslator] drawItem translation failed', error);
            }

            if (patchedLeft === rawLeft && patchedRight === rawRight) {
                // Nothing changed – call original without allocating a wrapper
                return originalDrawItem.call(this, index);
            }

            // Temporarily patch leftText / rigthText on the item instance so the
            // original drawItem reads our translated values.
            const origLeftText = item.leftText;
            const origRigthText = item.rigthText;

            if (patchedLeft !== rawLeft) {
                item.leftText = () => patchedLeft;
            }
            if (patchedRight !== rawRight) {
                item.rigthText = () => patchedRight;
            }

            try {
                originalDrawItem.call(this, index);
            } finally {
                item.leftText = origLeftText;
                item.rigthText = origRigthText;
            }
        };

        Object.defineProperty(proto, '__CHEAT_MANO_GP_WIN_DRAW_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    /**
     * Patch `drawSymbolObject` on the prototype chain of Window_InputSymbolList
     * so that each symbol's display name is translated before drawing.
     *
     * drawSymbolObject(symbolObject, x, y, width) ultimately calls:
     *   drawText(symbolObject.name(), x, y, width)
     *
     * We wrap it to temporarily override `name()` on the symbol object instance.
     *
     * @param {object|null} windowInstance
     */
    _patchSymbolListWindow(windowInstance) {
        const getRuntimeFromTranslator = () => this.getRuntime();
        const resolveFromTranslatorCache = (text, runtime = getRuntimeFromTranslator()) =>
            this.resolveFromCache(text, runtime);
        if (!windowInstance) {
            return;
        }

        const proto = this._findProtoWithOwn(windowInstance, 'drawSymbolObject');
        if (!proto) {
            return;
        }

        if (proto['__CHEAT_MANO_SYM_LIST_DRAW_PATCHED__']) {
            return;
        }

        const originalDrawSymbolObject = proto.drawSymbolObject;

        proto.drawSymbolObject = function (symbolObject, x, y, width) {
            if (!symbolObject || typeof symbolObject.name !== 'function') {
                return originalDrawSymbolObject.call(this, symbolObject, x, y, width);
            }

            let translated;
            try {
                const runtime = getRuntimeFromTranslator();
                translated = resolveFromTranslatorCache(symbolObject.name(), runtime);
            } catch (error) {
                console.warn(
                    '[ManoInputConfigTranslator] drawSymbolObject translation failed',
                    error
                );
                return originalDrawSymbolObject.call(this, symbolObject, x, y, width);
            }

            if (translated === symbolObject.name()) {
                return originalDrawSymbolObject.call(this, symbolObject, x, y, width);
            }

            // Temporarily shadow name() on the instance to feed the translated string
            const origName = symbolObject.name;
            symbolObject.name = () => translated;

            try {
                originalDrawSymbolObject.call(this, symbolObject, x, y, width);
            } finally {
                symbolObject.name = origName;
            }
        };

        Object.defineProperty(proto, '__CHEAT_MANO_SYM_LIST_DRAW_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    // ─── Scanning ─────────────────────────────────────────────────────────────

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = this.getPluginName().trim().toLowerCase();

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === pluginName;
            }) || null
        );
    }

    /**
     * Returns true if the parameters look like the old MV-era flat-string format
     * (pre-2022, before the MZ rewrite that introduced struct<MultiLangString>).
     *
     * Detection heuristic: the MV version stores command texts as plain strings
     * under keys like `textApply`, while the MZ version uses struct params like
     * `apply` (a JSON object with `jp`/`en` fields).
     *
     * @param {object} params
     * @returns {boolean}
     */
    _isMvStyleParams(params) {
        if (!params || typeof params !== 'object') {
            return false;
        }
        // MV has textApply as a plain non-JSON string
        const textApply = params['textApply'];
        if (
            typeof textApply === 'string' &&
            textApply.trim() &&
            !textApply.trim().startsWith('{')
        ) {
            return true;
        }
        return false;
    }

    /**
     * Collect translatable JP strings from the old MV-era flat-string parameters.
     *
     * @param {object} params
     * @param {string} scope
     * @param {Array}  output
     */
    _appendEntriesFromParametersMV(params, scope, output) {
        // ── Plain string command/symbol texts ────────────────────────────────
        const plainFields = [
            'textApply',
            'textRollback',
            'textDefault',
            'textChangeLayout',
            'textExit',
            'textEmpty',
            'textOK',
            'textCancel',
            'textShift',
            'textMenu',
            'textPageup',
            'textPagedown',
            'textEscape',
            'textSymbol6',
            'textSymbol7',
            'textSymbol8',
            'textUp',
            'textDown',
            'textLeft',
            'textRight',
            'commandName',
            'keyconfigCommandName',
        ];

        for (const field of plainFields) {
            const value = params[field];
            if (this.isUsableText(value)) {
                output.push({ text: value, source: { scope, field } });
            }
        }

        // ── Note-style params (outer-quoted) ─────────────────────────────────
        for (const field of ['GamepadIsNotConnected', 'needButtonDetouch']) {
            const raw = params[field];
            if (typeof raw === 'string' && raw.trim()) {
                const text = noteOrString(raw);
                if (this.isUsableText(text)) {
                    output.push({ text, source: { scope, field } });
                }
            }
        }
    }

    /**
     * Collect translatable JP strings from a Mano_InputConfig parameters object.
     * Automatically detects MV (pre-2022 flat strings) vs MZ (struct params).
     *
     * @param {object} params - Plugin parameters object (key→string).
     * @param {string} scope  - Label used in source metadata.
     * @param {Array}  output - Array to push entries into.
     */
    appendEntriesFromParameters(params, scope, output) {
        if (!params || typeof params !== 'object' || !Array.isArray(output)) {
            return;
        }

        if (this._isMvStyleParams(params)) {
            this._appendEntriesFromParametersMV(params, scope, output);
            return;
        }

        // ── struct<MultiLangString> parameters ───────────────────────────────
        for (const field of ['mapperDelete', 'gamepadConfigCommandText', 'keyConfigCommandText']) {
            const text = extractMultiLangString(params[field]);
            if (this.isUsableText(text)) {
                output.push({ text, source: { scope, field } });
            }
        }

        // ── struct<MultiLangNote> parameters ─────────────────────────────────
        for (const field of ['GamepadIsNotConnectedText', 'needButtonDetouchText']) {
            const text = extractMultiLangNote(params[field]);
            if (this.isUsableText(text)) {
                output.push({ text, source: { scope, field } });
            }
        }

        // ── struct<BasicSymbol> parameters ───────────────────────────────────
        const basicSymbolFields = [
            'basicOk',
            'basicCancel',
            'basicShift',
            'basicMenu',
            'basicEscape',
            'basicPageup',
            'basicPagedown',
        ];

        for (const field of basicSymbolFields) {
            const extracted = extractBasicSymbol(params[field]);

            if (this.isUsableText(extracted.name)) {
                output.push({ text: extracted.name, source: { scope, field, subField: 'name' } });
            }

            if (this.isUsableText(extracted.keyText)) {
                output.push({
                    text: extracted.keyText,
                    source: { scope, field, subField: 'keyText' },
                });
            }

            if (this.isUsableText(extracted.helpText)) {
                output.push({
                    text: extracted.helpText,
                    source: { scope, field, subField: 'helpText' },
                });
            }
        }

        // ── struct<KeyconfigCommand> parameters ──────────────────────────────
        for (const field of [
            'apply',
            'rollback',
            'reset',
            'WASD',
            'style',
            'changeLayout',
            'exit',
        ]) {
            const text = extractKeyconfigCommand(params[field]);
            if (this.isUsableText(text)) {
                output.push({ text, source: { scope, field } });
            }
        }

        // ── extendsMapper (array of struct<InputDefine>) ─────────────────────
        const extendersRaw = params['extendsMapper'];
        if (typeof extendersRaw === 'string' && extendersRaw.trim()) {
            const extenders = safeJsonParse(extendersRaw);
            if (Array.isArray(extenders)) {
                for (let i = 0; i < extenders.length; i++) {
                    const item = safeJsonParse(extenders[i]);
                    if (!item) {
                        continue;
                    }

                    const nameText =
                        typeof item.name === 'string' ? extractMultiLangString(item.name) : '';
                    if (this.isUsableText(nameText)) {
                        output.push({
                            text: nameText,
                            source: { scope, field: 'extendsMapper', index: i, subField: 'name' },
                        });
                    }

                    const helpText =
                        typeof item.helpText === 'string'
                            ? extractMultiLangString(item.helpText)
                            : '';
                    if (this.isUsableText(helpText)) {
                        output.push({
                            text: helpText,
                            source: {
                                scope,
                                field: 'extendsMapper',
                                index: i,
                                subField: 'helpText',
                            },
                        });
                    }
                }
            }
        }
    }

    buildScanEntries() {
        const entries = [];

        // Collect from $plugins entry (persisted parameters in plugins.js)
        const pluginEntry = this.findPluginEntry();
        if (pluginEntry && pluginEntry.parameters) {
            this.appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        // Collect from PluginManager.parameters() (runtime-merged parameters)
        const pluginManager = window['PluginManager'];
        if (pluginManager && typeof pluginManager.parameters === 'function') {
            const runtimeParams = pluginManager.parameters(this.getPluginName());
            if (runtimeParams && typeof runtimeParams === 'object') {
                this.appendEntriesFromParameters(
                    runtimeParams,
                    'runtimePluginManagerParameter',
                    entries
                );
            }
        }

        // Mano_InputConfig also defines some translatable labels in code literals
        // rather than plugin parameters (e.g. createButtonLayoutChangeCommand).
        for (const text of STATIC_PLUGIN_TEXTS) {
            if (this.isUsableText(text)) {
                entries.push({
                    text,
                    source: {
                        scope: 'pluginSourceLiteral',
                    },
                });
            }
        }

        return entries;
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
                console.warn('[ManoInputConfigTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    // ─── Cache key deduplication ──────────────────────────────────────────────

    buildUniquePendingItems(runtime) {
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
                    id: `plugin_mano_input_config_${byCacheKey.size}`,
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
