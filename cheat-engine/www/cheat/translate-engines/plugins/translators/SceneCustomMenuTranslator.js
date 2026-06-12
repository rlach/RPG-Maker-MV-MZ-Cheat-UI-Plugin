import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const DRAW_TEXT_TEMPLATE_LITERAL_CALL_RE_SOURCE =
    '(this\\.drawText(?:Ex)?\\(\\s*)`([^`]*)`(\\s*(?=,|\\)))';

function createDrawTextTemplateLiteralCallRegex() {
    return new RegExp(DRAW_TEXT_TEMPLATE_LITERAL_CALL_RE_SOURCE, 'g');
}

function normalizeCacheSourceText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

const TranslatedTexts = new Set();

function resolveCachedText(runtime, text, cacheType) {
    const normalizedText = normalizeCacheSourceText(text);
    if (!normalizedText) {
        return null;
    }

    const cacheKey = runtime.getCacheKey(normalizedText, cacheType);
    runtime.trackCacheKeyUsage(cacheKey, {
        harvestMissing: !TranslatedTexts.has(normalizedText),
    });

    if (!runtime.hasUsableCacheValue(cacheKey)) {
        return null;
    }

    const cached = runtime.translationCache.get(cacheKey);
    TranslatedTexts.add(cached);
    return typeof cached === 'string' && cached.trim() ? cached : null;
}

function escapeTemplateLiteralContent(text) {
    return text.replaceAll('\\', '\\\\').replaceAll('`', '\\`');
}

function extractDrawTextTemplateLiteralEntries(scriptSource) {
    if (typeof scriptSource !== 'string' || !scriptSource.trim()) {
        return [];
    }

    const entries = [];
    const regex = createDrawTextTemplateLiteralCallRegex();
    for (const match of scriptSource.matchAll(regex)) {
        const text = normalizeCacheSourceText(match[2]);
        if (text) {
            entries.push(text);
        }
    }
    return entries;
}

function translateItemDrawScriptLine(runtime, scriptLine, cacheType) {
    if (typeof scriptLine !== 'string' || !scriptLine.trim()) {
        return scriptLine;
    }

    return scriptLine.replace(
        createDrawTextTemplateLiteralCallRegex(),
        (match, prefix, templateLiteralText, suffix) => {
            const cached = resolveCachedText(runtime, templateLiteralText, cacheType);
            if (!cached) {
                return match;
            }

            return `${prefix}\`${escapeTemplateLiteralContent(cached)}\`${suffix}`;
        }
    );
}

function translateItemDrawScriptList(runtime, itemDrawScriptList, cacheType) {
    if (!Array.isArray(itemDrawScriptList) || itemDrawScriptList.length === 0) {
        return itemDrawScriptList;
    }

    let changed = false;
    const translated = itemDrawScriptList.map((line) => {
        const translatedLine = translateItemDrawScriptLine(runtime, line, cacheType);
        if (translatedLine !== line) {
            changed = true;
        }
        return translatedLine;
    });

    return changed ? translated : itemDrawScriptList;
}

/**
 * Extract translatable entries from a single command object.
 * @param {object} cmd
 * @param {object} source
 * @param {number} cmdIdx
 * @returns {Array}
 */
function extractCommandEntries(cmd, source, cmdIdx) {
    const entries = [];
    const cmdText = normalizeCacheSourceText(cmd.Text);
    if (cmdText) {
        entries.push({ text: cmdText, kind: 'commandText', source: { ...source, cmdIdx } });
    }
    const helpText = normalizeCacheSourceText(cmd.HelpText);
    if (helpText) {
        entries.push({ text: helpText, kind: 'helpText', source: { ...source, cmdIdx } });
    }
    return entries;
}

/**
 * Extract translatable entries from a single window object.
 * @param {object} win
 * @param {string} sceneId
 * @param {number} winIdx
 * @returns {Array}
 */
function extractWindowEntries(win, sceneId, winIdx) {
    const entries = [];
    const source = { sceneId, winIdx };

    const commonHelpText = normalizeCacheSourceText(win.CommonHelpText);
    if (commonHelpText) {
        entries.push({ text: commonHelpText, kind: 'commonHelpText', source });
    }

    const commandList = parseJsonSafely(win.CommandList, null);
    if (Array.isArray(commandList)) {
        for (let cmdIdx = 0; cmdIdx < commandList.length; cmdIdx++) {
            const cmd = parseJsonSafely(commandList[cmdIdx], null);
            if (cmd) {
                entries.push(...extractCommandEntries(cmd, source, cmdIdx));
            }
        }
    }

    const itemDrawScript = parseJsonSafely(win.ItemDrawScript, null);
    if (Array.isArray(itemDrawScript)) {
        for (let scriptIdx = 0; scriptIdx < itemDrawScript.length; scriptIdx++) {
            const scriptLine = itemDrawScript[scriptIdx];
            const templateTexts = extractDrawTextTemplateLiteralEntries(scriptLine);
            for (const text of templateTexts) {
                entries.push({
                    text,
                    kind: 'itemDrawScriptText',
                    source: { ...source, scriptIdx },
                });
            }
        }
    }

    return entries;
}

/**
 * Extract translatable entries from a single scene object.
 * @param {object} scene
 * @returns {Array}
 */
function extractSceneEntries(scene) {
    const entries = [];
    const sceneId = scene.Id.trim();
    const windowList = parseJsonSafely(scene.WindowList, null);
    if (!Array.isArray(windowList)) {
        return entries;
    }
    for (let winIdx = 0; winIdx < windowList.length; winIdx++) {
        const win = parseJsonSafely(windowList[winIdx]);
        if (win) {
            entries.push(...extractWindowEntries(win, sceneId, winIdx));
        }
    }
    return entries;
}

export class SceneCustomMenuTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'SceneCustomMenu';
    }

    getPluginLabel() {
        return 'SceneCustomMenu';
    }

    getCacheType() {
        return 'plugin_scene_custom_menu';
    }

    _resolveWindowCustomMenuCommand() {
        const windowClass = window.Window_CustomMenuCommand;
        if (windowClass?.prototype) {
            return windowClass;
        }

        // Some plugin builds keep classes as global const bindings rather than
        // attaching them to window.
        try {
            const globalClass = window.eval(
                'typeof Window_CustomMenuCommand !== "undefined" ? Window_CustomMenuCommand : null'
            );
            if (globalClass?.prototype) {
                return globalClass;
            }
        } catch (error) {
            console.warn(
                '[SceneCustomMenuTranslator] Failed to resolve Window_CustomMenuCommand',
                error
            );
        }

        return null;
    }

    _installCommandWindowHooks(proto) {
        if (!proto || proto.__CHEAT_SCENE_CUSTOM_MENU_TRANSLATION_PATCHED__) {
            return !!proto?.__CHEAT_SCENE_CUSTOM_MENU_TRANSLATION_PATCHED__;
        }

        if (typeof proto.drawItemSub !== 'function') {
            return false;
        }

        const cacheType = this.getCacheType();
        const getRuntime = () => this.getRuntime();
        const isRuntimeTranslationActive = (runtime) => this.isRuntimeTranslationActive(runtime);

        const installDrawTextHooks = (target) => {
            for (const methodName of ['drawText', 'drawTextEx']) {
                if (typeof target[methodName] !== 'function') {
                    continue;
                }

                const original = target[methodName];
                target[methodName] = function (...args) {
                    try {
                        const runtime = getRuntime();
                        if (
                            runtime &&
                            isRuntimeTranslationActive(runtime) &&
                            typeof args[0] === 'string'
                        ) {
                            const cached = resolveCachedText(runtime, args[0], cacheType);
                            if (cached) {
                                args[0] = cached;
                            }
                        }
                    } catch (error) {
                        console.warn(
                            '[SceneCustomMenuTranslator] Failed to translate draw text',
                            error
                        );
                    }

                    return original.apply(this, args);
                };
            }
        };

        installDrawTextHooks(proto);

        const originalDrawItemSub = proto.drawItemSub;
        proto.drawItemSub = function (item, rect, index) {
            const runtime = getRuntime();
            const runtimeTranslationActive = !!runtime && isRuntimeTranslationActive(runtime);
            const originalItemDrawScript = this?._data?.ItemDrawScript;
            let replacedItemDrawScript = false;

            if (runtimeTranslationActive && Array.isArray(originalItemDrawScript) && this?._data) {
                const translatedItemDrawScript = translateItemDrawScriptList(
                    runtime,
                    originalItemDrawScript,
                    cacheType
                );
                if (translatedItemDrawScript !== originalItemDrawScript) {
                    this._data.ItemDrawScript = translatedItemDrawScript;
                    replacedItemDrawScript = true;
                }
            }

            try {
                if (
                    runtimeTranslationActive &&
                    item &&
                    typeof item.Text === 'string' &&
                    item.Text.trim()
                ) {
                    const cached = resolveCachedText(runtime, item.Text, cacheType);
                    if (cached) {
                        return originalDrawItemSub.call(
                            this,
                            { ...item, Text: cached },
                            rect,
                            index
                        );
                    }
                }
            } catch (error) {
                console.warn(
                    '[SceneCustomMenuTranslator] Failed to apply cached command text translation',
                    error
                );
            } finally {
                if (replacedItemDrawScript && this?._data) {
                    this._data.ItemDrawScript = originalItemDrawScript;
                }
            }
            return originalDrawItemSub.call(this, item, rect, index);
        };

        if (typeof proto.findHelpText === 'function') {
            const originalFindHelpText = proto.findHelpText;
            proto.findHelpText = function () {
                const text = originalFindHelpText.call(this);
                if (typeof text !== 'string' || !text.trim()) {
                    return text;
                }
                try {
                    const runtime = getRuntime();
                    if (!runtime || !isRuntimeTranslationActive(runtime)) {
                        return text;
                    }
                    const cached = resolveCachedText(runtime, text, cacheType);
                    return cached || text;
                } catch (error) {
                    console.warn(
                        '[SceneCustomMenuTranslator] Failed to apply cached help text translation',
                        error
                    );
                    return text;
                }
            };
        }

        Object.defineProperty(proto, '__CHEAT_SCENE_CUSTOM_MENU_TRANSLATION_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
        return true;
    }

    _installCommandWindowInstanceHooks(windowInstance) {
        if (
            !windowInstance ||
            typeof windowInstance !== 'object' ||
            windowInstance.__CHEAT_SCENE_CUSTOM_MENU_INSTANCE_PATCHED__
        ) {
            return !!windowInstance?.__CHEAT_SCENE_CUSTOM_MENU_INSTANCE_PATCHED__;
        }

        const cacheType = this.getCacheType();
        const getRuntime = () => this.getRuntime();
        const isRuntimeTranslationActive = (runtime) => this.isRuntimeTranslationActive(runtime);

        const installDrawTextHooks = (target) => {
            for (const methodName of ['drawText', 'drawTextEx']) {
                if (typeof target[methodName] !== 'function') {
                    continue;
                }

                const original = target[methodName];
                target[methodName] = function (...args) {
                    try {
                        const runtime = getRuntime();
                        if (
                            runtime &&
                            isRuntimeTranslationActive(runtime) &&
                            typeof args[0] === 'string'
                        ) {
                            const cached = resolveCachedText(runtime, args[0], cacheType);
                            if (cached) {
                                args[0] = cached;
                            }
                        }
                    } catch (error) {
                        console.warn(
                            '[SceneCustomMenuTranslator] Failed to translate draw text',
                            error
                        );
                    }

                    return original.apply(this, args);
                };
            }
        };

        let patched = false;

        installDrawTextHooks(windowInstance);
        patched = true;

        if (typeof windowInstance.drawItemSub === 'function') {
            const originalDrawItemSub = windowInstance.drawItemSub;
            windowInstance.drawItemSub = function (item, rect, index) {
                const runtime = getRuntime();
                const runtimeTranslationActive = !!runtime && isRuntimeTranslationActive(runtime);
                const originalItemDrawScript = this?._data?.ItemDrawScript;
                let replacedItemDrawScript = false;

                if (
                    runtimeTranslationActive &&
                    Array.isArray(originalItemDrawScript) &&
                    this?._data
                ) {
                    const translatedItemDrawScript = translateItemDrawScriptList(
                        runtime,
                        originalItemDrawScript,
                        cacheType
                    );
                    if (translatedItemDrawScript !== originalItemDrawScript) {
                        this._data.ItemDrawScript = translatedItemDrawScript;
                        replacedItemDrawScript = true;
                    }
                }

                try {
                    if (
                        runtimeTranslationActive &&
                        item &&
                        typeof item.Text === 'string' &&
                        item.Text.trim()
                    ) {
                        const cached = resolveCachedText(runtime, item.Text, cacheType);
                        if (cached) {
                            return originalDrawItemSub.call(
                                this,
                                { ...item, Text: cached },
                                rect,
                                index
                            );
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[SceneCustomMenuTranslator] Failed to apply cached command text translation',
                        error
                    );
                } finally {
                    if (replacedItemDrawScript && this?._data) {
                        this._data.ItemDrawScript = originalItemDrawScript;
                    }
                }
                return originalDrawItemSub.call(this, item, rect, index);
            };
            patched = true;
        }

        if (typeof windowInstance.findHelpText === 'function') {
            const originalFindHelpText = windowInstance.findHelpText;
            windowInstance.findHelpText = function () {
                const text = originalFindHelpText.call(this);
                if (typeof text !== 'string' || !text.trim()) {
                    return text;
                }
                try {
                    const runtime = getRuntime();
                    if (!runtime || !isRuntimeTranslationActive(runtime)) {
                        return text;
                    }
                    const cached = resolveCachedText(runtime, text, cacheType);
                    return cached || text;
                } catch (error) {
                    console.warn(
                        '[SceneCustomMenuTranslator] Failed to apply cached help text translation',
                        error
                    );
                    return text;
                }
            };
            patched = true;
        }

        if (!patched) {
            return false;
        }

        Object.defineProperty(windowInstance, '__CHEAT_SCENE_CUSTOM_MENU_INSTANCE_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
        return true;
    }

    _patchSceneInstanceCommandWindows(scene) {
        if (!scene || typeof scene !== 'object') {
            return;
        }

        const maybePatchWindow = (value) => {
            if (!value || typeof value !== 'object') {
                return;
            }

            if (
                typeof value.drawItemSub === 'function' ||
                typeof value.findHelpText === 'function'
            ) {
                this._installCommandWindowInstanceHooks(value);
                this._installCommandWindowHooks(Object.getPrototypeOf(value));
            }
        };

        for (const value of Object.values(scene)) {
            maybePatchWindow(value);
        }

        if (scene._customWindowMap && typeof scene._customWindowMap.forEach === 'function') {
            scene._customWindowMap.forEach((windowInstance) => {
                maybePatchWindow(windowInstance);
            });
        }
    }

    _patchCustomMenuSceneClass(sceneClass) {
        if (!sceneClass?.prototype) {
            return;
        }

        const sceneProto = sceneClass.prototype;
        if (sceneProto.__CHEAT_SCENE_CUSTOM_MENU_SCENE_PATCHED__) {
            return;
        }

        const patchSceneInstance = (scene) => this._patchSceneInstanceCommandWindows(scene);
        if (typeof sceneProto.createCustomWindowInstance === 'function') {
            const originalCreateCustomWindowInstance = sceneProto.createCustomWindowInstance;
            sceneProto.createCustomWindowInstance = function (...args) {
                const windowInstance = originalCreateCustomWindowInstance.apply(this, args);
                try {
                    patchSceneInstance(this);
                } catch (error) {
                    console.warn(
                        '[SceneCustomMenuTranslator] Failed to patch window instance after creation',
                        error
                    );
                }
                return windowInstance;
            };
        }

        for (const methodName of ['create', 'start']) {
            if (typeof sceneProto[methodName] !== 'function') {
                continue;
            }

            const originalMethod = sceneProto[methodName];
            sceneProto[methodName] = function (...args) {
                const result = originalMethod.apply(this, args);
                try {
                    patchSceneInstance(this);
                } catch (error) {
                    console.warn(
                        '[SceneCustomMenuTranslator] Failed to patch scene command windows',
                        error
                    );
                }
                return result;
            };
        }

        Object.defineProperty(sceneProto, '__CHEAT_SCENE_CUSTOM_MENU_SCENE_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookSceneManagerFactory() {
        const sceneManager = window.SceneManager;
        if (typeof sceneManager?.createCustomMenuClass !== 'function') {
            return false;
        }

        if (sceneManager.__CHEAT_SCENE_CUSTOM_MENU_FACTORY_PATCHED__) {
            return true;
        }

        const patchSceneClass = (sceneClass) => this._patchCustomMenuSceneClass(sceneClass);
        const originalCreateCustomMenuClass = sceneManager.createCustomMenuClass;
        sceneManager.createCustomMenuClass = function (...args) {
            const sceneClass = originalCreateCustomMenuClass.apply(this, args);
            try {
                patchSceneClass(sceneClass);
            } catch (error) {
                console.warn(
                    '[SceneCustomMenuTranslator] Failed to patch custom menu scene class',
                    error
                );
            }
            return sceneClass;
        };

        Object.defineProperty(sceneManager, '__CHEAT_SCENE_CUSTOM_MENU_FACTORY_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
        return true;
    }

    enablePluginTranslation() {
        let enabled = false;

        const WindowCustomMenuCommand = this._resolveWindowCustomMenuCommand();
        if (WindowCustomMenuCommand?.prototype) {
            enabled = this._installCommandWindowHooks(WindowCustomMenuCommand.prototype) || enabled;
        }

        enabled = this._hookSceneManagerFactory() || enabled;

        if (!enabled) {
            console.log(
                '[SceneCustomMenuTranslator] Failed to hook SceneCustomMenu runtime; translation cannot be enabled'
            );
        }

        return enabled;
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
                console.warn('[SceneCustomMenuTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const pluginEntry = Array.isArray(window.$plugins)
            ? window.$plugins.find(
                  (p) =>
                      p &&
                      typeof p.name === 'string' &&
                      p.name.trim().toLowerCase() === 'scenecustommenu'
              )
            : null;

        if (!pluginEntry?.parameters) {
            return [];
        }

        const params = pluginEntry.parameters;
        const entries = [];

        for (let sceneIdx = 1; sceneIdx <= 20; sceneIdx++) {
            const scene = /** @type {any} */ (parseJsonSafely(params[`Scene${sceneIdx}`], null));
            if (scene && typeof scene.Id === 'string' && scene.Id.trim()) {
                entries.push(...extractSceneEntries(scene));
            }
        }

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_scene_custom_menu_${byCacheKey.size}`,
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
