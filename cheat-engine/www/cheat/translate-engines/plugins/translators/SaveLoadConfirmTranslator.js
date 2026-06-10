/**
 * SaveLoadConfirmTranslator
 *
 * Translator for SaveLoadConfirm.js
 * Supported versions:
 * - v1.0.0 - v1.1.1 (MZ)
 *
 * Text sources:
 * - Plugin parameters (termSave/termLoad/confirmOk/confirmNg/helpText)
 * - Rendered save/load variants derived from %1 templates to keep cache keys aligned
 *   with runtime payloads shown in command and help windows.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const PARAM_KEYS = ['termSave', 'termLoad', 'confirmOk', 'confirmNg', 'helpText'];

export class SaveLoadConfirmTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'SaveLoadConfirm';
    }

    getPluginAliases() {
        return ['SaveLoadConfirm', 'SaveLoadConfig'];
    }

    getPluginLabel() {
        return 'SaveLoadConfirm';
    }

    getCacheType() {
        return 'plugin_save_load_confirm';
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
                console.warn('[SaveLoadConfirmTranslator] Scan failed', error);
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

        for (const paramKey of PARAM_KEYS) {
            const text = String(parameters[paramKey] || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            entries.push({
                text,
                source: { scope: 'pluginParam', paramKey },
            });
        }

        this._collectRenderedTemplateVariants(parameters, entries);
        return entries;
    }

    _collectRenderedTemplateVariants(parameters, output) {
        const termSave = String(parameters.termSave || '');
        const termLoad = String(parameters.termLoad || '');
        const confirmOk = String(parameters.confirmOk || '');
        const helpText = String(parameters.helpText || '');

        const terms = [termSave, termLoad].filter((value) => this.isUsableText(value));

        for (const term of terms) {
            if (this.isUsableText(confirmOk)) {
                output.push({
                    text: confirmOk.format(term),
                    source: {
                        scope: 'runtimeDerived',
                        paramKey: 'confirmOk',
                        term,
                    },
                });
            }

            if (this.isUsableText(helpText)) {
                output.push({
                    text: helpText.format(term),
                    source: {
                        scope: 'runtimeDerived',
                        paramKey: 'helpText',
                        term,
                    },
                });
            }
        }
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
        const sceneFileProto = window.Scene_File?.prototype;
        const confirmProto = window.Window_SaveFileConfirm?.prototype;

        if (
            !sceneFileProto ||
            !confirmProto ||
            typeof sceneFileProto.createConfirmWindowIfNeed !== 'function' ||
            typeof confirmProto.makeCommandList !== 'function'
        ) {
            return false;
        }

        this._hookConfirmCommandList(confirmProto);
        this._hookConfirmWindowCreation(sceneFileProto);
        return true;
    }

    _hookConfirmCommandList(prototype) {
        if (prototype.__CHEAT_SAVE_LOAD_CONFIRM_MAKE_COMMAND_LIST_PATCHED__) {
            return;
        }

        const original = prototype.makeCommandList;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        prototype.makeCommandList = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this);
            }

            const originalAddCommand = this.addCommand;
            this.addCommand = function (name, symbol, enabled, ext) {
                const translated = resolveRuntimeTranslation(
                    name,
                    runtime,
                    'plugin_save_load_confirm',
                    {
                        requireRuntimeTranslationActive: true,
                        missValue: name,
                    }
                );

                return originalAddCommand.call(this, translated, symbol, enabled, ext);
            };

            try {
                return original.call(this);
            } finally {
                this.addCommand = originalAddCommand;
            }
        };

        Object.defineProperty(prototype, '__CHEAT_SAVE_LOAD_CONFIRM_MAKE_COMMAND_LIST_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookConfirmWindowCreation(prototype) {
        if (prototype.__CHEAT_SAVE_LOAD_CONFIRM_CREATE_WINDOW_PATCHED__) {
            return;
        }

        const original = prototype.createConfirmWindowIfNeed;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        prototype.createConfirmWindowIfNeed = function () {
            const result = original.call(this);
            const runtime = getRuntime();

            if (!isRuntimeTranslationActive(runtime)) {
                return result;
            }

            try {
                const helpText = this._helpWindow?._text;
                if (isUsableText(helpText)) {
                    const translatedHelp = resolveRuntimeTranslation(
                        helpText,
                        runtime,
                        'plugin_save_load_confirm',
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: helpText,
                        }
                    );
                    if (translatedHelp !== helpText) {
                        this._helpWindow.setText(translatedHelp);
                    }
                }
            } catch (error) {
                console.warn('[SaveLoadConfirmTranslator] Failed to translate help text', error);
            }

            return result;
        };

        Object.defineProperty(prototype, '__CHEAT_SAVE_LOAD_CONFIRM_CREATE_WINDOW_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _resolvePluginParameters() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
            return pluginEntry.parameters;
        }

        if (typeof window.PluginManager?.parameters === 'function') {
            const parameters = window.PluginManager.parameters(this.getPluginName());
            if (parameters && typeof parameters === 'object') {
                return parameters;
            }
        }

        return null;
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_save_load_confirm_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
