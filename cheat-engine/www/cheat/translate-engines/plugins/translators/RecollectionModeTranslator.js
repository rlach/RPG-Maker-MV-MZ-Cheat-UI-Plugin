/**
 * RecollectionModeTranslator
 *
 * Translator for RecollectionMode.js
 * Supported versions:
 * - v1.0.0 - v1.1.5 (MV)
 *
 * This plugin stores recollection UI text in the global
 * rngd_recollection_mode_settings object, not plugin parameters.
 *
 * Cache policy:
 * - Title/menu command labels are stored in command cache.
 * - Recollection list/locked text is stored in plugin cache.
 *
 * Runtime integration:
 * - Window_TitleCommand.addCommand: translates recollection title command label.
 * - Window_RecollectionCommand.addCommand: translates recollection command labels.
 * - Window_RecList.drawItem: translates recollection entry titles and locked title text.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const CACHE_TYPE = 'plugin_recollection_mode';

const TITLE_SYMBOL_RECOLLECTION = 'recollection';
const RECOLLECTION_COMMAND_SYMBOLS = new Set([
    'select_recollection',
    'select_cg',
    'select_back_title',
]);

export class RecollectionModeTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'RecollectionMode';
    }

    getPluginLabel() {
        return 'RecollectionMode';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const titleProto = this._resolvePrototype('Window_TitleCommand', 'addCommand');
        const recCommandProto = this._resolvePrototype('Window_RecollectionCommand', 'addCommand');
        const recListProto = this._resolvePrototype('Window_RecList', 'drawItem');

        if (!titleProto || !recCommandProto || !recListProto) {
            return false;
        }

        this._installTitleCommandHook(titleProto);
        this._installRecollectionCommandHook(recCommandProto);
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
                console.warn('[RecollectionModeTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const settings = this._getRecollectionSettings();
        if (!settings || typeof settings !== 'object') {
            return entries;
        }

        const commandWindow = settings.rec_mode_window;
        if (commandWindow && typeof commandWindow === 'object') {
            this._pushEntry(entries, commandWindow.recollection_title, 'command', {
                scope: 'settings',
                section: 'rec_mode_window',
                field: 'recollection_title',
            });
            this._pushEntry(entries, commandWindow.str_select_recollection, 'command', {
                scope: 'settings',
                section: 'rec_mode_window',
                field: 'str_select_recollection',
            });
            this._pushEntry(entries, commandWindow.str_select_cg, 'command', {
                scope: 'settings',
                section: 'rec_mode_window',
                field: 'str_select_cg',
            });
            this._pushEntry(entries, commandWindow.str_select_back_title, 'command', {
                scope: 'settings',
                section: 'rec_mode_window',
                field: 'str_select_back_title',
            });
        }

        const listWindow = settings.rec_list_window;
        if (listWindow && typeof listWindow === 'object') {
            this._pushEntry(entries, listWindow.never_watch_title_text, this.getCacheType(), {
                scope: 'settings',
                section: 'rec_list_window',
                field: 'never_watch_title_text',
            });
        }

        const recCgSet = settings.rec_cg_set;
        if (recCgSet && typeof recCgSet === 'object') {
            for (const [key, cgEntry] of Object.entries(recCgSet)) {
                if (!cgEntry || typeof cgEntry !== 'object') {
                    continue;
                }

                this._pushEntry(entries, cgEntry.title, this.getCacheType(), {
                    scope: 'settings',
                    section: 'rec_cg_set',
                    field: 'title',
                    key,
                });
            }
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

    _pushEntry(output, text, cacheType, source) {
        if (!this.isUsableText(text)) {
            return;
        }

        output.push({
            text,
            cacheType,
            source,
        });
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
                    id: `plugin_recollection_mode_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    _installTitleCommandHook(prototype) {
        if (prototype.__CHEAT_RECOLLECTION_MODE_TITLE_ADD_COMMAND_PATCHED__) {
            return;
        }

        const originalAddCommand = prototype.addCommand;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        prototype.addCommand = function (name, symbol, enabled, ext) {
            let translatedName = name;

            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    symbol === TITLE_SYMBOL_RECOLLECTION &&
                    isUsableText(name)
                ) {
                    translatedName = resolveRuntimeTranslation(name, runtime, 'command', {
                        requireRuntimeTranslationActive: true,
                        missValue: name,
                    });
                }
            } catch (error) {
                console.warn(
                    '[RecollectionModeTranslator] Failed to translate title recollection label',
                    error
                );
            }

            return originalAddCommand.call(this, translatedName, symbol, enabled, ext);
        };

        Object.defineProperty(prototype, '__CHEAT_RECOLLECTION_MODE_TITLE_ADD_COMMAND_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _installRecollectionCommandHook(prototype) {
        if (prototype.__CHEAT_RECOLLECTION_MODE_RECO_COMMAND_ADD_COMMAND_PATCHED__) {
            return;
        }

        const originalAddCommand = prototype.addCommand;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        prototype.addCommand = function (name, symbol, enabled, ext) {
            let translatedName = name;

            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    RECOLLECTION_COMMAND_SYMBOLS.has(symbol) &&
                    isUsableText(name)
                ) {
                    translatedName = resolveRuntimeTranslation(name, runtime, 'command', {
                        requireRuntimeTranslationActive: true,
                        missValue: name,
                    });
                }
            } catch (error) {
                console.warn(
                    '[RecollectionModeTranslator] Failed to translate recollection command label',
                    error
                );
            }

            return originalAddCommand.call(this, translatedName, symbol, enabled, ext);
        };

        Object.defineProperty(
            prototype,
            '__CHEAT_RECOLLECTION_MODE_RECO_COMMAND_ADD_COMMAND_PATCHED__',
            {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            }
        );
    }

    _installRecListDrawItemHook(prototype) {
        if (prototype.__CHEAT_RECOLLECTION_MODE_DRAW_ITEM_PATCHED__) {
            return;
        }

        const originalDrawItem = prototype.drawItem;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const applyRuntimeTranslations = this._applyRecListRuntimeTranslations.bind(this);
        const restoreRuntimeTranslations = this._restoreRecListRuntimeTranslations.bind(this);

        prototype.drawItem = function (index) {
            let restoreContext = null;

            try {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return originalDrawItem.call(this, index);
                }

                restoreContext = applyRuntimeTranslations(index, runtime);
            } catch (error) {
                console.warn(
                    '[RecollectionModeTranslator] Failed to apply list title translation',
                    error
                );
            }

            try {
                return originalDrawItem.call(this, index);
            } finally {
                restoreRuntimeTranslations(restoreContext);
            }
        };

        Object.defineProperty(prototype, '__CHEAT_RECOLLECTION_MODE_DRAW_ITEM_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _applyRecListRuntimeTranslations(index, runtime) {
        const settings = this._getRecollectionSettings();
        if (!settings || typeof settings !== 'object') {
            return null;
        }

        const recCgSet = settings.rec_cg_set;
        if (!recCgSet || typeof recCgSet !== 'object') {
            return null;
        }

        const cgEntry = recCgSet[String(index + 1)] || recCgSet[index + 1] || null;
        const listWindow = settings.rec_list_window;

        const originalTitle = cgEntry?.title;
        const originalNeverWatchTitle = listWindow?.never_watch_title_text;

        if (this.isUsableText(originalTitle)) {
            cgEntry.title = this.resolveRuntimeTranslation(
                originalTitle,
                runtime,
                this.getCacheType(),
                {
                    requireRuntimeTranslationActive: true,
                    missValue: originalTitle,
                }
            );
        }

        if (listWindow && this.isUsableText(originalNeverWatchTitle)) {
            listWindow.never_watch_title_text = this.resolveRuntimeTranslation(
                originalNeverWatchTitle,
                runtime,
                this.getCacheType(),
                {
                    requireRuntimeTranslationActive: true,
                    missValue: originalNeverWatchTitle,
                }
            );
        }

        return {
            cgEntry,
            listWindow,
            originalTitle,
            originalNeverWatchTitle,
        };
    }

    _restoreRecListRuntimeTranslations(context) {
        if (!context) {
            return;
        }

        if (context.cgEntry && context.originalTitle !== undefined) {
            context.cgEntry.title = context.originalTitle;
        }

        if (context.listWindow && context.originalNeverWatchTitle !== undefined) {
            context.listWindow.never_watch_title_text = context.originalNeverWatchTitle;
        }
    }

    _resolvePrototype(globalName, methodName) {
        const ctor = globalThis?.[globalName];
        const prototype = ctor?.prototype;
        if (!prototype || typeof prototype[methodName] !== 'function') {
            return null;
        }

        return prototype;
    }

    _getRecollectionSettings() {
        const settings = globalThis?.rngd_recollection_mode_settings;
        if (settings && typeof settings === 'object') {
            return settings;
        }

        return null;
    }
}
