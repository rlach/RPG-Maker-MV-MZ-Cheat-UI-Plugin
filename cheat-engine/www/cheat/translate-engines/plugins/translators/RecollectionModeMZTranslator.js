/**
 * RecollectionModeMZTranslator
 *
 * Translator for RecollectionModeMZ.js v1.0.0
 * Target engine: MZ
 *
 * RecollectionModeMZ stores most user-facing strings in plugin parameters,
 * including title command labels and recollection event descriptions.
 *
 * Runtime integration:
 * - Window_TitleCommand.addCommand: translates the recollection title command label.
 * - Window_RecollectionCommand.addCommand: translates selection command labels when present.
 * - Window_RecList.drawItem: translates event description/lockedDescription display text.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const CACHE_TYPE = 'plugin_recollection_mode_mz';

const PARAM_TITLE_ENTRY = 'recModeSelectWindowRecoTitle';
const PARAM_SELECT_RECOLLECTION = 'recModeSelectWindowSelectReco';
const PARAM_SELECT_CG = 'recModeSelectWindowSelectCg';
const PARAM_SELECT_BACK = 'recModeSelectWindowBackTitle';
const PARAM_NEVER_WATCH_TEXT = 'recModeListNeverWatchTextName';
const PARAM_EVENTS = 'recollectionEvents';

const TITLE_SYMBOL_RECOLLECTION = 'recollection';
const RECOLLECTION_COMMAND_SYMBOLS = new Set([
    'select_recollection',
    'select_cg',
    'select_back_title',
]);

export class RecollectionModeMZTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'RecollectionModeMZ';
    }

    getPluginLabel() {
        return 'RecollectionModeMZ';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const titleProto = this._resolvePrototype('Window_TitleCommand', 'addCommand');
        const recListProto = this._resolvePrototype('Window_RecList', 'drawItem');

        if (!titleProto || !recListProto) {
            return false;
        }

        this._installTitleCommandHook(titleProto);

        const recoCommandProto = this._resolvePrototype(
            'Window_RecollectionCommand',
            'addCommand'
        );
        if (recoCommandProto) {
            this._installRecollectionCommandHook(recoCommandProto);
        }

        this._installRecListDrawItemHook(recListProto);

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

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[RecollectionModeMZTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const parameters = this._resolvePluginParameters();

        if (!parameters) {
            return entries;
        }

        this._pushParameterEntry(parameters, PARAM_TITLE_ENTRY, 'titleCommand', entries);
        this._pushParameterEntry(
            parameters,
            PARAM_SELECT_RECOLLECTION,
            'recollectionCommand',
            entries
        );
        this._pushParameterEntry(parameters, PARAM_SELECT_CG, 'cgCommand', entries);
        this._pushParameterEntry(parameters, PARAM_SELECT_BACK, 'backCommand', entries);
        this._pushParameterEntry(parameters, PARAM_NEVER_WATCH_TEXT, 'lockedDefaultText', entries);

        this._collectEventDescriptionsFromParameters(parameters, entries);

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

    _resolvePluginParameters() {
        if (typeof window.PluginManager?.parameters === 'function') {
            const runtimeParameters = window.PluginManager.parameters(this.getPluginName());
            if (runtimeParameters && typeof runtimeParameters === 'object') {
                return runtimeParameters;
            }
        }

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            return pluginEntry.parameters;
        }

        return null;
    }

    _pushParameterEntry(parameters, key, field, output) {
        const text = typeof parameters?.[key] === 'string' ? parameters[key] : '';
        if (!this.isUsableText(text)) {
            return;
        }

        const cacheType =
            field === 'titleCommand' ||
            field === 'recollectionCommand' ||
            field === 'cgCommand' ||
            field === 'backCommand'
                ? 'command'
                : this.getCacheType();

        output.push({
            text,
            cacheType,
            source: {
                scope: 'pluginParameter',
                key,
                field,
            },
        });
    }

    _collectEventDescriptionsFromParameters(parameters, output) {
        const events = this._parseRecollectionEvents(parameters?.[PARAM_EVENTS]);
        for (let index = 0; index < events.length; index++) {
            const event = events[index];
            if (!event || typeof event !== 'object') {
                continue;
            }

            const description = typeof event.description === 'string' ? event.description : '';
            const lockedDescription =
                typeof event.lockedDescription === 'string' ? event.lockedDescription : '';

            if (this.isUsableText(description)) {
                output.push({
                    text: description,
                    cacheType: this.getCacheType(),
                    source: {
                        scope: 'pluginParameter',
                        key: PARAM_EVENTS,
                        field: 'description',
                        index,
                    },
                });
            }

            if (this.isUsableText(lockedDescription)) {
                output.push({
                    text: lockedDescription,
                    cacheType: this.getCacheType(),
                    source: {
                        scope: 'pluginParameter',
                        key: PARAM_EVENTS,
                        field: 'lockedDescription',
                        index,
                    },
                });
            }
        }
    }

    _parseRecollectionEvents(rawValue) {
        const parsedArray = this._parseNestedJson(rawValue, []);
        if (!Array.isArray(parsedArray)) {
            return [];
        }

        return parsedArray
            .map((entry) => this._parseNestedJson(entry, null))
            .filter((entry) => entry && typeof entry === 'object');
    }

    _parseNestedJson(value, fallback) {
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

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const entryCacheType = this.isUsableText(entry?.cacheType)
                ? entry.cacheType
                : this.getCacheType();
            const cacheKey = runtime.getCacheKey(text, entryCacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: entryCacheType,
                    id: `plugin_recollection_mode_mz_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    _installTitleCommandHook(prototype) {
        if (prototype.__CHEAT_RECOLLECTION_MODE_MZ_TITLE_ADD_COMMAND_PATCHED__) {
            return;
        }

        const originalAddCommand = prototype.addCommand;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveCommandTranslation = this._resolveCommandRuntimeText.bind(this);

        prototype.addCommand = function (name, symbol, enabled, ext) {
            let translatedName = name;

            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    symbol === TITLE_SYMBOL_RECOLLECTION &&
                    isUsableText(name)
                ) {
                    translatedName = resolveCommandTranslation(name, runtime);
                }
            } catch (error) {
                console.warn(
                    '[RecollectionModeMZTranslator] Failed to translate title recollection label',
                    error
                );
            }

            return originalAddCommand.call(this, translatedName, symbol, enabled, ext);
        };

        Object.defineProperty(prototype, '__CHEAT_RECOLLECTION_MODE_MZ_TITLE_ADD_COMMAND_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _installRecollectionCommandHook(prototype) {
        if (prototype.__CHEAT_RECOLLECTION_MODE_MZ_RECO_COMMAND_ADD_COMMAND_PATCHED__) {
            return;
        }

        const originalAddCommand = prototype.addCommand;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveCommandTranslation = this._resolveCommandRuntimeText.bind(this);

        prototype.addCommand = function (name, symbol, enabled, ext) {
            let translatedName = name;

            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    RECOLLECTION_COMMAND_SYMBOLS.has(symbol) &&
                    isUsableText(name)
                ) {
                    translatedName = resolveCommandTranslation(name, runtime);
                }
            } catch (error) {
                console.warn(
                    '[RecollectionModeMZTranslator] Failed to translate recollection command label',
                    error
                );
            }

            return originalAddCommand.call(this, translatedName, symbol, enabled, ext);
        };

        Object.defineProperty(
            prototype,
            '__CHEAT_RECOLLECTION_MODE_MZ_RECO_COMMAND_ADD_COMMAND_PATCHED__',
            {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            }
        );
    }

    _installRecListDrawItemHook(prototype) {
        if (prototype.__CHEAT_RECOLLECTION_MODE_MZ_DRAW_ITEM_PATCHED__) {
            return;
        }

        const originalDrawItem = prototype.drawItem;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateRuntimeText = this._resolveRuntimeText.bind(this);
        const applyRecListRuntimeTranslations = this._applyRecListRuntimeTranslations.bind(this);
        const restoreRecListRuntimeTranslations = this._restoreRecListRuntimeTranslations.bind(this);

        prototype.drawItem = function (index) {
            let restoreContext = null;

            try {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return originalDrawItem.call(this, index);
                }

                restoreContext = applyRecListRuntimeTranslations(index, runtime, translateRuntimeText);
            } catch (error) {
                console.warn(
                    '[RecollectionModeMZTranslator] Failed to apply list description translation',
                    error
                );
            }

            try {
                return originalDrawItem.call(this, index);
            } finally {
                restoreRecListRuntimeTranslations(restoreContext);
            }
        };

        Object.defineProperty(prototype, '__CHEAT_RECOLLECTION_MODE_MZ_DRAW_ITEM_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _resolveRuntimeText(text, runtime) {
        return this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: text,
        });
    }

    _resolveCommandRuntimeText(text, runtime) {
        return this.resolveRuntimeTranslation(text, runtime, 'command', {
            requireRuntimeTranslationActive: true,
            missValue: text,
        });
    }

    _applyRecListRuntimeTranslations(index, runtime, translateRuntimeText) {
        const settings = this._getRecollectionSettings();
        if (!settings || typeof settings !== 'object') {
            return null;
        }

        const event = Array.isArray(settings.recollectionEvents)
            ? settings.recollectionEvents[index]
            : null;

        if (!event || typeof event !== 'object') {
            return null;
        }

        const originalDescription = event.description;
        const originalLockedDescription = event.lockedDescription;
        const originalNeverWatchText = settings?.recModeList?.recModeListNeverWatchTextName;

        if (this.isUsableText(originalDescription)) {
            event.description = translateRuntimeText(originalDescription, runtime);
        }

        if (this.isUsableText(originalLockedDescription)) {
            event.lockedDescription = translateRuntimeText(originalLockedDescription, runtime);
        }

        if (settings.recModeList && this.isUsableText(originalNeverWatchText)) {
            settings.recModeList.recModeListNeverWatchTextName =
                translateRuntimeText(originalNeverWatchText, runtime);
        }

        return {
            event,
            settings,
            originalDescription,
            originalLockedDescription,
            originalNeverWatchText,
        };
    }

    _restoreRecListRuntimeTranslations(context) {
        if (!context) {
            return;
        }

        if (context.event && typeof context.event === 'object') {
            if (context.originalDescription !== undefined) {
                context.event.description = context.originalDescription;
            }
            if (context.originalLockedDescription !== undefined) {
                context.event.lockedDescription = context.originalLockedDescription;
            }
        }

        if (context.settings?.recModeList && context.originalNeverWatchText !== undefined) {
            context.settings.recModeList.recModeListNeverWatchTextName =
                context.originalNeverWatchText;
        }
    }

    _resolvePrototype(globalName, methodName) {
        const ctor = this._resolveGlobalConstructor(globalName);
        const prototype = ctor?.prototype;
        if (!prototype || typeof prototype[methodName] !== 'function') {
            return null;
        }
        return prototype;
    }

    _resolveGlobalConstructor(globalName) {
        const fromGlobalThis = globalThis?.[globalName];
        if (typeof fromGlobalThis === 'function') {
            return fromGlobalThis;
        }

        if (globalName === 'Window_RecList' && typeof Window_RecList !== 'undefined') {
            return Window_RecList;
        }

        if (
            globalName === 'Window_RecollectionCommand' &&
            typeof Window_RecollectionCommand !== 'undefined'
        ) {
            return Window_RecollectionCommand;
        }

        return null;
    }

    _getRecollectionSettings() {
        if (
            globalThis?.rngdRecollectionModeMZSettings &&
            typeof globalThis.rngdRecollectionModeMZSettings === 'object'
        ) {
            return globalThis.rngdRecollectionModeMZSettings;
        }

        if (typeof rngdRecollectionModeMZSettings !== 'undefined') {
            return rngdRecollectionModeMZSettings;
        }

        return null;
    }
}
