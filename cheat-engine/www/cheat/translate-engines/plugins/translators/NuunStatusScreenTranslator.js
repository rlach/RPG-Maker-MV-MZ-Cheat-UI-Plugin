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

const DIRECT_TEXT_PARAMETER_KEYS = Object.freeze(['PageNextSymbol', 'PagePreviousSymbol']);

const STRUCT_TEXT_FIELDS = Object.freeze([
    'ParamName',
    'paramName',
    'paramUnit',
    'UnitText',
    'RadarChartParamName',
]);

const FALLBACK_STATUS_LABELS = Object.freeze([
    '命中率',
    '回避率',
    '会心率',
    '会心回避',
    '魔法回避',
    '魔法反射率',
    '反撃率',
    '再生率',
    '再生率',
    '再生率',
    '狙われ率',
    '防御効果率',
    '回復効果率',
    '薬の知識',
    '消費率',
    'チャージ率',
    '物理ダメージ率',
    '魔法ダメージ率',
    '床ダメージ率',
    '経験値獲得率',
    '会心回避率',
    '魔法回避率',
    '魔法反射率',
    '反撃率',
    'HP再生率',
    'MP再生率',
    'TP再生率',
    '狙われ率',
    '防御効果率',
    '回復効果率',
    '薬の知識',
    'MP消費率',
    'TPチャージ率',
    '物理ダメージ率',
    '魔法ダメージ率',
    '床ダメージ率',
    '獲得経験率',
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

        for (let index = 0; index < FALLBACK_STATUS_LABELS.length; index++) {
            this.appendEntry(output, FALLBACK_STATUS_LABELS[index], {
                scope,
                field: 'fallbackStatusLabel',
                index,
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

        return entries;
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

    installDrawTextHooks() {
        const windowStatusPrototype = window.Window_Status?.prototype;
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
