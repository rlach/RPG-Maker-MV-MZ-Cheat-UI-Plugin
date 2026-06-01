// @ts-nocheck
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * NUUN_Result translator
 *
 * Supported plugin versions:
 * - NUUN_Result.js (MZ)
 *
 * Translation notes:
 * - Text comes from top-level plugin parameters and the nested result-data
 *   lists used to build battle/reward result windows.
 * - Runtime hooks translate the visible result-window titles and the per-row
 *   labels drawn by the battle result subwindows.
 */

const PLUGIN_NAME = 'NUUN_Result';
const CACHE_TYPE = 'plugin_nuun_result';
const HOOK_FLAG = '__CHEAT_NUUN_RESULT_PATCHED__';
const WINDOW_DRAW_HOOK_FLAG = '__CHEAT_NUUN_RESULT_WINDOW_DRAW_PATCHED__';
const RESULT_EXP_VALUE_SPRITE_HOOK_FLAG = '__CHEAT_NUUN_RESULT_EXP_VALUE_SPRITE_PATCHED__';

const TOP_LEVEL_TEXT_FIELDS = new Set([
    'ResultName',
    'LevelUpResultHelpName',
    'GetEXPName',
    'GetItemName',
    'LevelUpName',
    'learnSkillName',
]);
const NESTED_TEXT_FIELDS = new Set(['ParamName', 'SystemName', 'Text', 'Name', 'HelpText']);

export class NuunResultTranslator extends BasePluginTranslator {
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
        return 'NUUN Result';
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
                console.warn('[NUUN_ResultTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        for (const source of this._resolveParameterSources()) {
            this._appendTopLevelEntries(entries, source);
            this._appendNestedListEntries(entries, source);
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
        const sceneBattleProto = window.Scene_Battle?.prototype;
        let hooksApplied = false;

        if (sceneBattleProto) {
            hooksApplied = this._patchSceneBattlePrototype(sceneBattleProto) || hooksApplied;
        }

        hooksApplied = this.patchResultWindowPrototypes() || hooksApplied;
        hooksApplied = this.patchResultWindowTextDrawing() || hooksApplied;

        return hooksApplied;
    }

    _patchSceneBattlePrototype(sceneBattleProto) {
        if (!sceneBattleProto || sceneBattleProto[HOOK_FLAG]) {
            return !!sceneBattleProto?.[HOOK_FLAG];
        }

        let patched = false;
        const patchResultHelpWindowInstance = this.patchResultHelpWindowInstance.bind(this);
        const resolveParameterText = this._resolveParameterText.bind(this);
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const translateRuntimeText = this._translateRuntimeText.bind(this);

        if (typeof sceneBattleProto.createResultHelpWindow === 'function') {
            const originalCreateResultHelpWindow = sceneBattleProto.createResultHelpWindow;
            sceneBattleProto.createResultHelpWindow = function () {
                const result = originalCreateResultHelpWindow.apply(this, arguments);
                patchResultHelpWindowInstance(this._resultHelpWindow);
                return result;
            };
            patched = true;
        }

        if (typeof sceneBattleProto.openLevelUpWindow === 'function') {
            const originalOpenLevelUpWindow = sceneBattleProto.openLevelUpWindow;
            sceneBattleProto.openLevelUpWindow = function () {
                const runtime = getRuntime();
                const originalText = resolveParameterText('LevelUpResultHelpName');
                if (runtime && isUsableText(originalText)) {
                    const translated = translateRuntimeText(runtime, originalText);
                    if (isUsableText(translated)) {
                        this._cheatNuunResultLevelUpHelpText = translated;
                    }
                }

                const result = originalOpenLevelUpWindow.apply(this, arguments);
                this._cheatNuunResultLevelUpHelpText = null;
                return result;
            };
            patched = true;
        }

        if (typeof sceneBattleProto.update === 'function') {
            const originalUpdate = sceneBattleProto.update;
            const patchResultWindowPrototypes = this.patchResultWindowPrototypes.bind(this);
            const patchResultWindowTextDrawing = this.patchResultWindowTextDrawing.bind(this);
            sceneBattleProto.update = function () {
                const result = originalUpdate.apply(this, arguments);
                patchResultWindowPrototypes();
                patchResultWindowTextDrawing();
                return result;
            };
            patched = true;
        }

        if (!patched) {
            return false;
        }

        Object.defineProperty(sceneBattleProto, HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    patchResultHelpWindowInstance(windowInstance) {
        if (!windowInstance) {
            return;
        }

        const proto = Object.getPrototypeOf(windowInstance);
        if (!proto || typeof proto.setText !== 'function' || proto[HOOK_FLAG]) {
            return;
        }

        const originalSetText = proto.setText;
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const translateRuntimeText = this._translateRuntimeText.bind(this);

        proto.setText = function (text) {
            if (!isUsableText(text)) {
                return originalSetText.apply(this, arguments);
            }

            try {
                const runtime = getRuntime();
                if (!runtime) {
                    return originalSetText.call(this, text);
                }

                const sourceText = String(text);
                return originalSetText.call(this, translateRuntimeText(runtime, sourceText));
            } catch (error) {
                console.warn('[NUUN_ResultTranslator] Failed to translate result help text', error);
                return originalSetText.apply(this, arguments);
            }
        };

        Object.defineProperty(proto, HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    patchResultWindowPrototypes() {
        let patched = false;
        const getInfoProto = window.Window_ResultGetInfo?.prototype;
        if (getInfoProto && !getInfoProto[HOOK_FLAG]) {
            patched = this._patchDataTextMethod(getInfoProto, 'drawGainGold') || patched;
            patched = this._patchDataTextMethod(getInfoProto, 'drawGainExp') || patched;
            patched = this._patchDataTextMethod(getInfoProto, 'drawPartyOriginalParam') || patched;
            patched = this._patchDataTextMethod(getInfoProto, 'drawDropItemName') || patched;
            patched = this._patchDataTextMethod(getInfoProto, 'drawStealItemName') || patched;
            patched = this._patchDataTextMethod(getInfoProto, 'drawGetItems') || patched;
            patched = this._patchAllDrawMethods(getInfoProto) || patched;

            Object.defineProperty(getInfoProto, HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        const levelUpProto = window.Window_ResultLevelUpHelp?.prototype;
        if (
            levelUpProto &&
            typeof levelUpProto.refresh === 'function' &&
            !levelUpProto[HOOK_FLAG]
        ) {
            const originalRefresh = levelUpProto.refresh;
            const getRuntime = this.getRuntime.bind(this);
            const isUsableText = this.isUsableText.bind(this);
            const translateRuntimeText = this._translateRuntimeText.bind(this);
            levelUpProto.refresh = function () {
                const runtime = getRuntime();
                const originalText = this._text;
                if (runtime && isUsableText(originalText)) {
                    this._text = translateRuntimeText(runtime, originalText);
                }

                try {
                    return originalRefresh.apply(this, arguments);
                } finally {
                    this._text = originalText;
                }
            };

            Object.defineProperty(levelUpProto, HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
            patched = true;
        }

        const resultExpValueProto = window.Sprite_ResultExpValue?.prototype;
        if (
            resultExpValueProto &&
            typeof resultExpValueProto.redraw === 'function' &&
            !resultExpValueProto[RESULT_EXP_VALUE_SPRITE_HOOK_FLAG]
        ) {
            const originalRedraw = resultExpValueProto.redraw;
            const getRuntime = this.getRuntime.bind(this);
            const isUsableText = this.isUsableText.bind(this);
            const translateRuntimeText = this._translateRuntimeText.bind(this);
            resultExpValueProto.redraw = function () {
                const runtime = getRuntime();
                const sourceData = this._data;
                if (
                    runtime &&
                    sourceData &&
                    typeof sourceData === 'object' &&
                    isUsableText(sourceData.ParamName)
                ) {
                    this._data = {
                        ...sourceData,
                        ParamName: translateRuntimeText(runtime, String(sourceData.ParamName)),
                    };
                }

                try {
                    return originalRedraw.apply(this, arguments);
                } finally {
                    this._data = sourceData;
                }
            };

            Object.defineProperty(resultExpValueProto, RESULT_EXP_VALUE_SPRITE_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
            patched = true;
        }

        return patched;
    }

    patchResultWindowTextDrawing() {
        const baseProto = window.Window_Base?.prototype;
        if (
            !baseProto ||
            typeof baseProto.drawText !== 'function' ||
            typeof baseProto.drawTextEx !== 'function'
        ) {
            return false;
        }

        if (baseProto[WINDOW_DRAW_HOOK_FLAG]) {
            return true;
        }

        const originalDrawText = baseProto.drawText;
        const originalDrawTextEx = baseProto.drawTextEx;
        const getRuntime = this.getRuntime.bind(this);
        const translateRuntimeText = this._translateRuntimeText.bind(this);
        const shouldObserveResultWindow = this._shouldObserveResultWindow.bind(this);

        baseProto.drawText = function (text, x, y, maxWidth, align) {
            let nextText = text;
            const runtime = getRuntime();
            if (runtime && typeof text === 'string' && shouldObserveResultWindow(this)) {
                nextText = translateRuntimeText(runtime, text);
            }

            return originalDrawText.call(this, nextText, x, y, maxWidth, align);
        };

        baseProto.drawTextEx = function (text, x, y, width) {
            let nextText = text;
            const runtime = getRuntime();
            if (runtime && typeof text === 'string' && shouldObserveResultWindow(this)) {
                nextText = translateRuntimeText(runtime, text);
            }

            return originalDrawTextEx.call(this, nextText, x, y, width);
        };

        Object.defineProperty(baseProto, WINDOW_DRAW_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    _shouldObserveResultWindow(windowInstance) {
        const windowName = String(windowInstance?.constructor?.name || '');
        if (!windowName) {
            return false;
        }

        if (/^Window_Result/i.test(windowName) || /^Window_Victory/i.test(windowName)) {
            return true;
        }

        return windowName === 'Window_BattleResult';
    }

    _translateRuntimeText(runtime, sourceText) {
        if (!this.isUsableText(sourceText)) {
            return sourceText;
        }

        const templateTranslated = this._translateTextFromTemplate(
            runtime,
            sourceText,
            this._resolveParameterText('LevelUpResultHelpName')
        );
        if (templateTranslated !== sourceText) {
            return templateTranslated;
        }

        const translated = this.resolveRuntimeTranslation(
            sourceText,
            runtime,
            this.getCacheType(),
            {
                requireRuntimeTranslationActive: true,
                missValue: sourceText,
                harvestMissing: false,
            }
        );

        return this.isUsableText(translated) ? translated : sourceText;
    }

    _translateTextFromTemplate(runtime, sourceText, templateText) {
        if (!this.isUsableText(sourceText) || !this.isUsableText(templateText)) {
            return sourceText;
        }

        const template = String(templateText);
        if (!/%\d+/.test(template)) {
            return sourceText;
        }

        const translatedTemplate = this.resolveRuntimeTranslation(
            template,
            runtime,
            this.getCacheType(),
            {
                requireRuntimeTranslationActive: true,
                missValue: template,
                harvestMissing: false,
            }
        );
        if (!this.isUsableText(translatedTemplate)) {
            return sourceText;
        }

        const placeholders = [];
        const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
        const regexSource = escaped.replace(/%(\d+)/g, (_match, token) => {
            placeholders.push(token);
            return String.raw`([\s\S]*?)`;
        });
        const match = new RegExp(`^${regexSource}$`).exec(String(sourceText));
        if (!match) {
            return sourceText;
        }

        let rebuilt = String(translatedTemplate);
        for (let i = 0; i < placeholders.length; i += 1) {
            const token = placeholders[i];
            const value = String(match[i + 1] || '');
            rebuilt = rebuilt.replaceAll(`%${token}`, value);
        }

        return rebuilt;
    }

    _patchAllDrawMethods(proto) {
        if (!proto) {
            return false;
        }

        let patched = false;
        const methodNames = Object.getOwnPropertyNames(proto);
        for (const methodName of methodNames) {
            if (!/^draw[A-Z]/.test(methodName)) {
                continue;
            }

            patched = this._patchDataTextMethod(proto, methodName) || patched;
        }

        return patched;
    }

    _patchDataTextMethod(proto, methodName) {
        if (!proto || typeof proto[methodName] !== 'function') {
            return false;
        }

        const flagName = `__CHEAT_NUUN_RESULT_${methodName}_PATCHED__`;
        if (proto[flagName]) {
            return true;
        }

        const original = proto[methodName];
        const translateDataObject = this._translateDataObject.bind(this);
        const getRuntime = this.getRuntime.bind(this);

        proto[methodName] = function (data) {
            const runtime = getRuntime();
            if (!runtime || !data || typeof data !== 'object') {
                return original.apply(this, arguments);
            }

            const nextData = translateDataObject(data, runtime);
            const nextArguments = Array.from(arguments);
            nextArguments[0] = nextData;
            return original.apply(this, nextArguments);
        };

        Object.defineProperty(proto, flagName, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    _translateDataObject(data, runtime) {
        return this._translateValueRecursive(data, runtime);
    }

    _translateValueRecursive(value, runtime) {
        if (typeof value === 'string') {
            return this._translateStringValue(value, runtime);
        }

        if (Array.isArray(value)) {
            return this._translateArrayValue(value, runtime);
        }

        if (value && typeof value === 'object') {
            return this._translateObjectValue(value, runtime);
        }

        return value;
    }

    _translateStringValue(value, runtime) {
        if (!this.isUsableText(value)) {
            return value;
        }

        const sourceText = String(value);
        const translated = this.resolveRuntimeTranslation(
            sourceText,
            runtime,
            this.getCacheType(),
            {
                requireRuntimeTranslationActive: true,
                missValue: sourceText,
                harvestMissing: false,
            }
        );

        return this.isUsableText(translated) ? translated : sourceText;
    }

    _translateArrayValue(value, runtime) {
        let mutated = false;
        const next = value.map((entry) => {
            const translatedEntry = this._translateValueRecursive(entry, runtime);
            if (translatedEntry !== entry) {
                mutated = true;
            }
            return translatedEntry;
        });
        return mutated ? next : value;
    }

    _translateObjectValue(value, runtime) {
        let mutated = false;
        const next = {};
        for (const [key, entry] of Object.entries(value)) {
            const translatedEntry = this._translateValueRecursive(entry, runtime);
            if (translatedEntry !== entry) {
                mutated = true;
            }
            next[key] = translatedEntry;
        }
        return mutated ? next : value;
    }

    _appendTopLevelEntries(output, source) {
        for (const field of TOP_LEVEL_TEXT_FIELDS) {
            const text = source.parameters?.[field];
            this._appendIfUsable(output, text, source, field);
        }
    }

    _appendNestedListEntries(output, source) {
        for (const field of Object.keys(source.parameters || {})) {
            const rawValue = source.parameters[field];
            if (!this.isUsableText(rawValue)) {
                continue;
            }

            const parsedList = this._parseNestedArrayParameter(rawValue);
            if (!Array.isArray(parsedList)) {
                continue;
            }

            for (const parsedRawEntry of parsedList) {
                const parsedEntry = parseJsonSafely(parsedRawEntry, null);
                if (!parsedEntry || typeof parsedEntry !== 'object') {
                    continue;
                }

                this._appendNestedEntries(output, parsedEntry, source);
            }
        }
    }

    _parseNestedArrayParameter(rawValue) {
        const source = String(rawValue || '').trim();
        if (!(source.startsWith('[') && source.endsWith(']'))) {
            return null;
        }

        const parsed = parseJsonSafely(source, null);
        return Array.isArray(parsed) ? parsed : null;
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
                sources.push({
                    scope: 'runtimePluginManagerParameter',
                    parameters: runtimeParameters,
                });
            }
        }

        return sources;
    }

    _appendIfUsable(output, text, source, field) {
        if (!Array.isArray(output) || !this.isUsableText(text)) {
            return;
        }

        output.push({
            text: String(text),
            source: {
                scope: source.scope,
                field,
            },
        });
    }

    _appendNestedEntries(output, object, source) {
        if (!object || typeof object !== 'object') {
            return;
        }

        for (const key of Object.keys(object)) {
            const text = object[key];
            this._appendNestedEntryValue(output, key, text, source);
        }
    }

    _appendNestedEntryValue(output, key, text, source) {
        if (typeof text === 'string') {
            if (this._appendNestedJsonStringEntries(output, text, source)) {
                return;
            }

            if (NESTED_TEXT_FIELDS.has(key)) {
                this._appendIfUsable(output, text, source, key);
                return;
            }

            if (
                this.isUsableText(text) &&
                /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\s]/.test(text)
            ) {
                this._appendIfUsable(output, text, source, key);
            }
            return;
        }

        if (Array.isArray(text)) {
            for (const entry of text) {
                this._appendNestedEntries(output, entry, source);
            }
            return;
        }

        if (text && typeof text === 'object') {
            this._appendNestedEntries(output, text, source);
        }
    }

    _appendNestedJsonStringEntries(output, text, source) {
        const trimmed = String(text || '').trim();
        if (
            !(
                (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                (trimmed.startsWith('[') && trimmed.endsWith(']'))
            )
        ) {
            return false;
        }

        const parsed = parseJsonSafely(trimmed, null);
        if (Array.isArray(parsed)) {
            for (const entry of parsed) {
                this._appendNestedEntries(output, entry, source);
            }
            return true;
        }

        if (parsed && typeof parsed === 'object') {
            this._appendNestedEntries(output, parsed, source);
            return true;
        }

        return false;
    }

    _resolveParameterText(field) {
        for (const source of this._resolveParameterSources()) {
            const value = source.parameters?.[field];
            if (this.isUsableText(value)) {
                return String(value);
            }
        }

        return '';
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
                id: `plugin_nuun_result_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
