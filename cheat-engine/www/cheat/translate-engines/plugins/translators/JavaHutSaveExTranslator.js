/**
 * JavaHutSaveExTranslator
 *
 * Plugin: JavaHut_SaveEx.js
 * Version: v1.03 (MV)
 *
 * Text sources:
 * - JavaHut_SaveEx plugin parameters (save labels, menu command, warning texts)
 * - Runtime autosave slot label literal: "Autosave"
 *
 * Runtime hooks:
 * - Window_SavefileList.drawFileId (save slot labels)
 * - Window_MenuCommand.addOriginalCommands (translated load command insertion)
 * - Window_Prompt.commandName + Window_Prompt.drawMessageText (warning modal text)
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_FLAG = '__CHEAT_JAVAHUT_SAVEEX_TRANSLATOR_HOOKED__';
const CACHE_TYPE = 'plugin_javahut_saveex';
const AUTOSAVE_LABEL = 'Autosave';
const PARAM_TEXT_KEYS = [
    'Save File Name',
    'Menu Load Command',
    'Warning Confirm Text',
    'Warning Cancel Text',
    'Exit Game Warning',
    'Save Overwrite Warning',
    'Load Game Warning',
];

function toNormalizedText(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return typeof value === 'string' ? value : String(value);
}

export class JavaHutSaveExTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'JavaHut_SaveEx';
    }

    getPluginLabel() {
        return 'JavaHut SaveEx';
    }

    getCacheType() {
        return CACHE_TYPE;
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

        this._scanPromise = Promise.resolve()
            .then(() => {
                this._scanEntries = this.buildScanEntries();
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[JavaHutSaveExTranslator] Failed to precompute scan entries', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const parameters = pluginEntry?.parameters;
        if (!parameters || typeof parameters !== 'object') {
            return entries;
        }

        for (const paramKey of PARAM_TEXT_KEYS) {
            const text = toNormalizedText(parameters[paramKey]);
            if (!this.isUsableText(text)) {
                continue;
            }

            entries.push({
                text,
                source: { scope: 'pluginParam', paramKey },
            });
        }

        entries.push({
            text: AUTOSAVE_LABEL,
            source: { scope: 'runtimeLiteral', key: 'autosaveLabel' },
        });

        return entries;
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }

        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
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
        if (window[RUNTIME_HOOK_FLAG]) {
            return true;
        }

        const saveEx = globalThis.JavaHut?.SaveEx;
        if (!saveEx?.Param) {
            return false;
        }

        if (
            typeof Window_SavefileList?.prototype?.drawFileId !== 'function' ||
            typeof Window_MenuCommand?.prototype?.addOriginalCommands !== 'function' ||
            typeof Window_Prompt?.prototype?.drawMessageText !== 'function' ||
            typeof Window_Prompt?.prototype?.commandName !== 'function'
        ) {
            return false;
        }

        this._installSavefileHook();
        this._installMenuCommandHook();
        this._installPromptHooks();

        window[RUNTIME_HOOK_FLAG] = true;
        return true;
    }

    _resolveTranslatedText(text, runtime) {
        return this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: text,
        });
    }

    _installSavefileHook() {
        const getRuntime = () => this.getRuntime();
        const isRuntimeTranslationActive = (runtime) => this.isRuntimeTranslationActive(runtime);
        const resolveTranslatedText = (text, runtime) => this._resolveTranslatedText(text, runtime);
        const originalDrawFileId = Window_SavefileList.prototype.drawFileId;

        Window_SavefileList.prototype.drawFileId = function (id, x, y, height) {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalDrawFileId.call(this, id, x, y, height);
            }

            const drawText = this.drawText;
            this.drawText = function (text, drawX, drawY, maxWidth, align) {
                const sourceText = toNormalizedText(text);
                const translatedText = resolveTranslatedText(sourceText, runtime);

                return drawText.call(this, translatedText, drawX, drawY, maxWidth, align);
            };

            try {
                return originalDrawFileId.call(this, id, x, y, height);
            } finally {
                this.drawText = drawText;
            }
        };
    }

    _installMenuCommandHook() {
        const getRuntime = () => this.getRuntime();
        const isRuntimeTranslationActive = (runtime) => this.isRuntimeTranslationActive(runtime);
        const resolveTranslatedText = (text, runtime) => this._resolveTranslatedText(text, runtime);
        const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;

        Window_MenuCommand.prototype.addOriginalCommands = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalAddOriginalCommands.call(this);
            }

            const saveEx = globalThis.JavaHut?.SaveEx;
            const originalText = toNormalizedText(saveEx?.Param?.SVEX_loadCommand);
            const translatedText = resolveTranslatedText(originalText, runtime);

            saveEx.Param.SVEX_loadCommand = translatedText;
            try {
                return originalAddOriginalCommands.call(this);
            } finally {
                saveEx.Param.SVEX_loadCommand = originalText;
            }
        };
    }

    _installPromptHooks() {
        const getRuntime = () => this.getRuntime();
        const isRuntimeTranslationActive = (runtime) => this.isRuntimeTranslationActive(runtime);
        const resolveTranslatedText = (text, runtime) => this._resolveTranslatedText(text, runtime);
        const originalPromptCommandName = Window_Prompt.prototype.commandName;
        Window_Prompt.prototype.commandName = function (index) {
            const sourceText = toNormalizedText(originalPromptCommandName.call(this, index));
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return sourceText;
            }

            return resolveTranslatedText(sourceText, runtime);
        };

        const originalDrawMessageText = Window_Prompt.prototype.drawMessageText;
        Window_Prompt.prototype.drawMessageText = function (index, text) {
            const sourceText = toNormalizedText(text);
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalDrawMessageText.call(this, index, sourceText);
            }

            const translatedText = resolveTranslatedText(sourceText, runtime);

            return originalDrawMessageText.call(this, index, translatedText);
        };
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = toNormalizedText(entry?.text);
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `javahut_saveex_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }
}
