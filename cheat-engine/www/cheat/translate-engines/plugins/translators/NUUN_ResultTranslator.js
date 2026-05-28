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

const TOP_LEVEL_TEXT_FIELDS = new Set(['ResultName', 'LevelUpResultHelpName']);
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
        const leftStrings = items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey)).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }

    enablePluginTranslation() {
        const sceneBattleProto = window.Scene_Battle?.prototype;
        if (!sceneBattleProto || typeof sceneBattleProto.createResultHelpWindow !== 'function') {
            return false;
        }

        if (sceneBattleProto[HOOK_FLAG]) {
            return true;
        }

        const originalCreateResultHelpWindow = sceneBattleProto.createResultHelpWindow;
        const originalOpenLevelUpWindow = sceneBattleProto.openLevelUpWindow;
        const patchResultHelpWindowInstance = this.patchResultHelpWindowInstance.bind(this);
        const patchResultWindowPrototypes = this.patchResultWindowPrototypes.bind(this);
        const resolveParameterText = this._resolveParameterText.bind(this);
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        sceneBattleProto.createResultHelpWindow = function () {
            const result = originalCreateResultHelpWindow.apply(this, arguments);
            patchResultHelpWindowInstance(this._resultHelpWindow);
            return result;
        };

        sceneBattleProto.openLevelUpWindow = function () {
            const runtime = getRuntime();
            const originalText = resolveParameterText('LevelUpResultHelpName');
            if (runtime && isUsableText(originalText)) {
                const cacheKey = runtime.getCacheKey(originalText, CACHE_TYPE);
                runtime.trackCacheKeyUsage(cacheKey);
                if (isRuntimeTranslationActive(runtime)) {
                    const translated = resolveRuntimeTranslation(originalText, runtime, CACHE_TYPE, {
                        requireRuntimeTranslationActive: true,
                        missValue: originalText,
                    });
                    if (isUsableText(translated)) {
                        this._cheatNuunResultLevelUpHelpText = translated;
                    }
                }
            }

            const result = originalOpenLevelUpWindow.apply(this, arguments);
            this._cheatNuunResultLevelUpHelpText = null;
            return result;
        };

        patchResultWindowPrototypes();

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
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();

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
                const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                runtime.trackCacheKeyUsage(cacheKey);
                if (!isRuntimeTranslationActive(runtime)) {
                    return originalSetText.call(this, sourceText);
                }

                const translated = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                    requireRuntimeTranslationActive: true,
                    missValue: sourceText,
                });

                return originalSetText.call(this, isUsableText(translated) ? translated : sourceText);
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
        const getInfoProto = window.Window_ResultGetInfo?.prototype;
        if (getInfoProto && typeof getInfoProto.drawGainGold === 'function' && !getInfoProto[HOOK_FLAG]) {
            this._patchDataTextMethod(getInfoProto, 'drawGainGold');
            this._patchDataTextMethod(getInfoProto, 'drawGainExp');
            this._patchDataTextMethod(getInfoProto, 'drawPartyOriginalParam');
            this._patchDataTextMethod(getInfoProto, 'drawDropItemName');
            this._patchDataTextMethod(getInfoProto, 'drawStealItemName');
            this._patchDataTextMethod(getInfoProto, 'drawGetItems');

            Object.defineProperty(getInfoProto, HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        const levelUpProto = window.Window_ResultLevelUpHelp?.prototype;
        if (levelUpProto && typeof levelUpProto.refresh === 'function' && !levelUpProto[HOOK_FLAG]) {
            const originalRefresh = levelUpProto.refresh;
            const getRuntime = this.getRuntime.bind(this);
            const isUsableText = this.isUsableText.bind(this);
            const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
            const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
            levelUpProto.refresh = function () {
                const runtime = getRuntime();
                const originalText = this._text;
                if (runtime && isUsableText(originalText)) {
                    const cacheKey = runtime.getCacheKey(originalText, CACHE_TYPE);
                    runtime.trackCacheKeyUsage(cacheKey);
                    if (isRuntimeTranslationActive(runtime)) {
                        const translated = resolveRuntimeTranslation(
                            originalText,
                            runtime,
                            CACHE_TYPE,
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: originalText,
                            }
                        );
                        if (isUsableText(translated)) {
                            this._text = translated;
                        }
                    }
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
        }
    }

    _patchDataTextMethod(proto, methodName) {
        if (!proto || typeof proto[methodName] !== 'function') {
            return;
        }

        const flagName = `__CHEAT_NUUN_RESULT_${methodName}_PATCHED__`;
        if (proto[flagName]) {
            return;
        }

        const original = proto[methodName];
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();

        proto[methodName] = function (data) {
            const runtime = getRuntime();
            if (!runtime || !data || typeof data !== 'object') {
                return original.apply(this, arguments);
            }

            const nextData = this._translateDataObject(
                data,
                runtime,
                cacheType,
                isRuntimeTranslationActive,
                resolveRuntimeTranslation,
                isUsableText
            );
            return original.call(this, nextData);
        };

        Object.defineProperty(proto, flagName, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _translateDataObject(data, runtime, cacheType, isRuntimeTranslationActive, resolveRuntimeTranslation, isUsableText) {
        let nextData = null;

        for (const key of Object.keys(data)) {
            if (!NESTED_TEXT_FIELDS.has(key)) {
                continue;
            }

            const value = data[key];
            if (!isUsableText(value)) {
                continue;
            }

            const sourceText = String(value);
            const cacheKey = runtime.getCacheKey(sourceText, cacheType);
            runtime.trackCacheKeyUsage(cacheKey);
            if (!isRuntimeTranslationActive(runtime)) {
                continue;
            }

            const translated = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                requireRuntimeTranslationActive: true,
                missValue: sourceText,
            });

            if (!isUsableText(translated) || translated === sourceText) {
                continue;
            }

            if (!nextData) {
                nextData = { ...data };
            }

            nextData[key] = translated;
        }

        return nextData || data;
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
            if (!this.isUsableText(rawValue) || !field.endsWith('List')) {
                continue;
            }

            const parsedList = parseJsonSafely(rawValue, []);
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

    _resolveParameterSources() {
        const sources = [];
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            sources.push({ scope: 'pluginEntryParameter', parameters: pluginEntry.parameters });
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const runtimeParameters = window.PluginManager.parameters(this.getPluginName());
            if (runtimeParameters && typeof runtimeParameters === 'object') {
                sources.push({ scope: 'runtimePluginManagerParameter', parameters: runtimeParameters });
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
            if (!NESTED_TEXT_FIELDS.has(key)) {
                continue;
            }

            const text = object[key];
            this._appendIfUsable(output, text, source, key);
        }
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