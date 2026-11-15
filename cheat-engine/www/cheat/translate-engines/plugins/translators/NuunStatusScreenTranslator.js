import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * NUUN_StatusScreen translator
 *
 * Plugin: NUUN_StatusScreen.js
 * Supported versions:
 * - v2.7.3 (MZ): parameter-driven status page labels and section titles.
 *
 * Notes:
 * - Translatable strings are collected from plugin parameters, including nested
 *   JSON/struct arrays used by page lists and radar chart settings.
 * - Runtime hooks are constrained to Window_Status text rendering paths and
 *   only translate known plugin-owned source strings.
 */

const PLUGIN_NAME = 'NUUN_StatusScreen';
const CACHE_TYPE = 'plugin_nuun_status_screen';

const DIRECT_TEXT_PARAMETER_KEYS = Object.freeze([
    'PageNextSymbol',
    'PagePreviousSymbol',
    'ParamName',
    'EquipsName',
    'XParamName',
    'SParamName',
    'ElementName',
    'StateName',
    'OriginalParam1Name',
    'OriginalParam2Name',
]);

const STRUCT_TEXT_FIELDS = Object.freeze([
    'ParamName',
    'paramName',
    'XparamName',
    'SparamName',
    'XparamUnit',
    'SparamUnit',
    'paramUnit',
    'UnitText',
    'RadarChartParamName',
]);

function shouldSkipLiteralText(value) {
    const text = String(value || '');
    if (!text.trim()) {
        return true;
    }

    if (/^(true|false|null)$/i.test(text)) {
        return true;
    }

    if (/^-?\d+(?:\.\d+)?$/.test(text)) {
        return true;
    }

    if (/^'(?:left|right|center)'$/i.test(text)) {
        return true;
    }

    if (/^(?:left|right|center)$/i.test(text)) {
        return true;
    }

    return false;
}

export class NuunStatusScreenTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownTexts = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'NUUN StatusScreen';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    appendEntry(output, text, source) {
        if (!Array.isArray(output) || !this.isUsableText(text) || shouldSkipLiteralText(text)) {
            return;
        }

        output.push({ text: String(text), source });
    }

    appendDirectParameterEntries(output, parameters, scope) {
        if (!Array.isArray(output) || !parameters || typeof parameters !== 'object') {
            return;
        }

        for (const key of DIRECT_TEXT_PARAMETER_KEYS) {
            const value = parameters[key];
            if (!this.isUsableText(value)) {
                continue;
            }

            this.appendEntry(output, value, {
                scope,
                field: key,
            });
        }
    }

    appendStructuredEntries(output, value, source) {
        if (value === null || value === undefined) {
            return;
        }

        if (typeof value === 'string') {
            const parsed = parseJsonSafely(value, value);
            if (parsed !== value) {
                this.appendStructuredEntries(output, parsed, source);
                return;
            }
        }

        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index++) {
                this.appendStructuredEntries(output, value[index], {
                    ...source,
                    index,
                });
            }
            return;
        }

        if (typeof value === 'object') {
            for (const [field, fieldValue] of Object.entries(value)) {
                const nextSource = { ...source, field };

                if (STRUCT_TEXT_FIELDS.includes(field) && this.isUsableText(fieldValue)) {
                    this.appendEntry(output, fieldValue, nextSource);
                }

                this.appendStructuredEntries(output, fieldValue, nextSource);
            }
        }
    }

    appendParameterEntries(output, parameters, scope) {
        if (!Array.isArray(output) || !parameters || typeof parameters !== 'object') {
            return;
        }

        this.appendDirectParameterEntries(output, parameters, scope);

        for (const [key, value] of Object.entries(parameters)) {
            this.appendStructuredEntries(output, value, {
                scope,
                param: key,
            });
        }
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.appendParameterEntries(entries, pluginEntry.parameters, 'pluginEntryParameters');
        }

        const pluginManager = window.PluginManager;
        if (pluginManager && typeof pluginManager.parameters === 'function') {
            const runtimeParameters = pluginManager.parameters(this.getPluginName());
            this.appendParameterEntries(
                entries,
                runtimeParameters,
                'runtimePluginManagerParameters'
            );
        }

        this.collectRuntimeParameterNames(entries, pluginEntry?.parameters || {});
        return entries;
    }

    collectRuntimeParameterNames(output, parameters) {
        let scene;
        let content = this._contentPrototype ? Object.create(this._contentPrototype) : null;
        try {
            if (
                !content &&
                typeof window.Scene_Status?.prototype.createStatusContentWindow === 'function'
            ) {
                scene = Object.create(window.Scene_Status.prototype);
                scene.addChild = () => {};
                scene.createStatusContentWindow();
                content = scene._leftContentWindow || scene._rightContentWindow;
            }
            if (!content) return;
            for (const [field, method, nameField] of [
                ['Xparam', 'XparamName', 'XparamName'],
                ['Sparam', 'SparamName', 'SparamName'],
            ]) {
                if (typeof content[method] !== 'function') continue;
                const settings = parseJsonSafely(parameters[field], []);
                for (let index = 0; index < settings.length; index++) {
                    const setting = parseJsonSafely(settings[index], settings[index]);
                    if (field === 'Xparam' && !setting[nameField] && Number(setting.XparamId) < 2)
                        continue;
                    this.appendEntry(output, content[method](index), {
                        scope: 'runtimeParameterName',
                        field,
                        index,
                    });
                }
            }
        } finally {
            if (scene) {
                for (const field of ['_leftContentWindow', '_rightContentWindow'])
                    scene[field]?.destroy();
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
                this._knownTexts = null;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[NuunStatusScreenTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    getKnownTexts() {
        if (this._knownTexts instanceof Set) {
            return this._knownTexts;
        }

        const entries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const known = new Set();

        for (const entry of entries) {
            const text = entry?.text;
            if (this.isUsableText(text)) {
                known.add(String(text));
            }
        }

        this._knownTexts = known;
        return known;
    }

    translateKnownText(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceText = String(text);
        if (!this.getKnownTexts().has(sourceText)) {
            return sourceText;
        }

        return this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: sourceText,
        });
    }

    installParamNameHook() {
        const windowStatusPrototype = window.Window_Status?.prototype;
        if (
            !windowStatusPrototype ||
            typeof windowStatusPrototype.paramNameShow !== 'function' ||
            windowStatusPrototype.__CHEAT_NUUN_STATUS_SCREEN_PARAM_NAME_HOOKED__
        ) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const translateKnownText = this.translateKnownText.bind(this);
        const original = windowStatusPrototype.paramNameShow;

        windowStatusPrototype.paramNameShow = function () {
            const result = original.apply(this, arguments);
            return translateKnownText(result, getRuntime());
        };

        windowStatusPrototype.__CHEAT_NUUN_STATUS_SCREEN_PARAM_NAME_HOOKED__ = true;
        return true;
    }

    installDrawTextHooks(windowStatusPrototype = window.Window_Status?.prototype) {
        if (!windowStatusPrototype) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const translateKnownText = this.translateKnownText.bind(this);
        let installed = false;

        if (
            typeof windowStatusPrototype.drawText === 'function' &&
            !windowStatusPrototype.__CHEAT_NUUN_STATUS_SCREEN_DRAW_TEXT_HOOKED__
        ) {
            const originalDrawText = windowStatusPrototype.drawText;
            windowStatusPrototype.drawText = function () {
                if (arguments.length > 0) {
                    arguments[0] = translateKnownText(arguments[0], getRuntime());
                }

                return originalDrawText.apply(this, arguments);
            };

            windowStatusPrototype.__CHEAT_NUUN_STATUS_SCREEN_DRAW_TEXT_HOOKED__ = true;
            installed = true;
        }

        if (
            typeof windowStatusPrototype.drawTextEx === 'function' &&
            !windowStatusPrototype.__CHEAT_NUUN_STATUS_SCREEN_DRAW_TEXT_EX_HOOKED__
        ) {
            const originalDrawTextEx = windowStatusPrototype.drawTextEx;
            windowStatusPrototype.drawTextEx = function () {
                if (arguments.length > 0) {
                    arguments[0] = translateKnownText(arguments[0], getRuntime());
                }

                return originalDrawTextEx.apply(this, arguments);
            };

            windowStatusPrototype.__CHEAT_NUUN_STATUS_SCREEN_DRAW_TEXT_EX_HOOKED__ = true;
            installed = true;
        }

        return installed;
    }

    hookContentWindows(scene) {
        for (const field of ['_leftContentWindow', '_rightContentWindow']) {
            const instance = scene?.[field];
            if (instance) {
                this._contentPrototype = Object.getPrototypeOf(instance);
                this.installDrawTextHooks(Object.getPrototypeOf(instance));
            }
        }
    }

    enablePluginTranslation() {
        const hasWindowStatus = !!window.Window_Status?.prototype;
        const hasParamNameHook =
            hasWindowStatus && typeof window.Window_Status.prototype.paramNameShow === 'function';
        const hasDrawTextHook =
            hasWindowStatus &&
            (typeof window.Window_Status.prototype.drawText === 'function' ||
                typeof window.Window_Status.prototype.drawTextEx === 'function');

        if (!hasParamNameHook && !hasDrawTextHook) {
            return false;
        }

        const paramNameHookInstalled = this.installParamNameHook();
        const drawTextHooksInstalled = this.installDrawTextHooks();
        const translator = this;
        const scenePrototype = window.Scene_Status?.prototype;
        if (
            typeof scenePrototype?.createStatusContentWindow === 'function' &&
            !scenePrototype.__cheatNuunContentHook
        ) {
            const original = scenePrototype.createStatusContentWindow;
            scenePrototype.createStatusContentWindow = function (...args) {
                const result = original.apply(this, args);
                translator.hookContentWindows(this);
                return result;
            };
            Object.defineProperty(scenePrototype, '__cheatNuunContentHook', { value: true });
        }
        this.hookContentWindows(window.SceneManager?._scene);

        return paramNameHookInstalled || drawTextHooksInstalled;
    }

    buildUniquePendingItems(runtime) {
        const entries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const byCacheKey = new Map();

        for (const entry of entries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_nuun_status_screen_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
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
