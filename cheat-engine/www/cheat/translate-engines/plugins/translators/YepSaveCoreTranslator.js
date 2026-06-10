import { BasePluginTranslator } from '../BasePluginTranslator.js';

const PARAM_TEXT_KEYS = [
    'Load Command',
    'Save Command',
    'Delete Command',
    'Select Help',
    'Load Help',
    'Save Help',
    'Delete Help',
    'Invalid Game Text',
    'Empty Game Text',
    'Map Location',
    'Playtime',
    'Save Count',
    'Gold Count',
    'Level Format',
    'Load Text',
    'Save Text',
    'Delete Text',
    'Confirm Yes',
    'Confirm No',
];

const DATA_COLUMN_KEYS = ['Data Column 1', 'Data Column 2', 'Data Column 3', 'Data Column 4'];

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export class YepSaveCoreTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
    }

    getPluginName() {
        return 'YEP_SaveCore';
    }

    getPluginLabel() {
        return 'YEP Save Core';
    }

    getCacheType() {
        return 'plugin_yep_save_core';
    }

    async precomputeCounts() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        this._scanEntries = this.buildScanEntries();
        this._scanPrepared = true;
    }

    buildScanEntries() {
        const parameters = this._resolvePluginParameters();
        if (!parameters) {
            return [];
        }

        const entries = [];
        for (const paramKey of PARAM_TEXT_KEYS) {
            const text = String(parameters[paramKey] || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            entries.push({
                text,
                source: { scope: 'pluginParam', paramKey },
            });
        }

        for (const paramKey of DATA_COLUMN_KEYS) {
            const rawValue = String(parameters[paramKey] || '');
            if (!this.isUsableText(rawValue)) {
                continue;
            }

            const segments = rawValue.split(',');
            for (const segment of segments) {
                const match = /^\s*(?:left|center|right)?\s*text\s*:(.*)$/i.exec(segment);
                if (!match) {
                    continue;
                }

                const text = String(match[1] || '').trim();
                if (!this.isUsableText(text)) {
                    continue;
                }

                entries.push({
                    text,
                    source: { scope: 'dataColumnText', paramKey },
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

    enablePluginTranslation() {
        const horzCommandProto = globalThis['Window_HorzCommand']?.prototype;
        const commandProto = window.Window_Command?.prototype;
        const helpProto = window.Window_Help?.prototype;
        const windowBaseProto = window.Window_Base?.prototype;

        if (
            !horzCommandProto ||
            !commandProto ||
            !helpProto ||
            !windowBaseProto ||
            typeof horzCommandProto.addCommand !== 'function' ||
            typeof commandProto.addCommand !== 'function' ||
            typeof helpProto.setText !== 'function' ||
            typeof windowBaseProto.drawText !== 'function' ||
            typeof windowBaseProto.drawTextEx !== 'function'
        ) {
            return false;
        }

        const runtimeSource = this._buildRuntimeSource();
        this._hookSaveActionCommands(horzCommandProto);
        this._hookSaveConfirmCommands(commandProto);
        this._hookHelpWindowText(helpProto, runtimeSource);
        this._hookSaveInfoDrawText(windowBaseProto, runtimeSource);
        this._hookSaveInfoDrawTextEx(windowBaseProto, runtimeSource);
        return true;
    }

    _buildRuntimeSource() {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const exactTexts = new Set();
        const templates = [];

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            exactTexts.add(text);
            if (!/%\d+/.test(text)) {
                continue;
            }

            const pattern = escapeRegExp(text).replace(/%\d+/g, '(.+?)');
            templates.push({
                template: text,
                regex: new RegExp(`^${pattern}$`),
            });
        }

        return { exactTexts, templates };
    }

    _translateRenderedText(text, runtime, runtimeSource) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const cacheType = this.getCacheType();
        const cacheKey = runtime.getCacheKey(text, cacheType);
        if (runtime.hasUsableCacheValue(cacheKey)) {
            return this.resolveRuntimeTranslation(text, runtime, cacheType, {
                requireRuntimeTranslationActive: true,
                missValue: text,
            });
        }

        for (const templateEntry of runtimeSource.templates) {
            const match = text.match(templateEntry.regex);
            if (!match) {
                continue;
            }

            const translatedTemplate = this.resolveRuntimeTranslation(
                templateEntry.template,
                runtime,
                cacheType,
                {
                    requireRuntimeTranslationActive: true,
                    missValue: templateEntry.template,
                }
            );

            if (translatedTemplate === templateEntry.template) {
                break;
            }

            return translatedTemplate.replace(/%([1-9]\d*)/g, (placeholder, indexText) => {
                const captureIndex = Number(indexText);
                return match[captureIndex] ?? placeholder;
            });
        }

        return text;
    }

    _hookSaveActionCommands(prototype) {
        if (prototype.__CHEAT_YEP_SAVE_CORE_ACTION_COMMAND_PATCHED__) {
            return;
        }

        const original = prototype.addCommand;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        prototype.addCommand = function (name, symbol, enabled, ext) {
            if (this?.constructor?.name !== 'Window_SaveAction') {
                return original.call(this, name, symbol, enabled, ext);
            }

            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, name, symbol, enabled, ext);
            }

            const translated = resolveRuntimeTranslation(name, runtime, 'plugin_yep_save_core', {
                requireRuntimeTranslationActive: true,
                missValue: name,
            });

            return original.call(this, translated, symbol, enabled, ext);
        };

        Object.defineProperty(prototype, '__CHEAT_YEP_SAVE_CORE_ACTION_COMMAND_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookSaveConfirmCommands(prototype) {
        if (prototype.__CHEAT_YEP_SAVE_CORE_CONFIRM_COMMAND_PATCHED__) {
            return;
        }

        const original = prototype.addCommand;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        prototype.addCommand = function (name, symbol, enabled, ext) {
            if (this?.constructor?.name !== 'Window_SaveConfirm') {
                return original.call(this, name, symbol, enabled, ext);
            }

            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, name, symbol, enabled, ext);
            }

            const translated = resolveRuntimeTranslation(name, runtime, 'plugin_yep_save_core', {
                requireRuntimeTranslationActive: true,
                missValue: name,
            });

            return original.call(this, translated, symbol, enabled, ext);
        };

        Object.defineProperty(prototype, '__CHEAT_YEP_SAVE_CORE_CONFIRM_COMMAND_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookHelpWindowText(prototype, runtimeSource) {
        if (prototype.__CHEAT_YEP_SAVE_CORE_HELP_TEXT_PATCHED__) {
            return;
        }

        const original = prototype.setText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateRenderedText = this._translateRenderedText.bind(this);

        prototype.setText = function (text) {
            let renderedText = text;

            try {
                const runtime = getRuntime();
                if (isRuntimeTranslationActive(runtime)) {
                    renderedText = translateRenderedText(text, runtime, runtimeSource);
                }
            } catch (error) {
                console.warn('[YepSaveCoreTranslator] Failed to translate help text', error);
            }

            return original.call(this, renderedText);
        };

        Object.defineProperty(prototype, '__CHEAT_YEP_SAVE_CORE_HELP_TEXT_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookSaveInfoDrawText(prototype, runtimeSource) {
        if (prototype.__CHEAT_YEP_SAVE_CORE_DRAW_TEXT_PATCHED__) {
            return;
        }

        const original = prototype.drawText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateRenderedText = this._translateRenderedText.bind(this);

        prototype.drawText = function (text, x, y, maxWidth, align) {
            if (this?.constructor?.name !== 'Window_SaveInfo') {
                return original.call(this, text, x, y, maxWidth, align);
            }

            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, text, x, y, maxWidth, align);
            }

            const renderedText = translateRenderedText(text, runtime, runtimeSource);

            return original.call(this, renderedText, x, y, maxWidth, align);
        };

        Object.defineProperty(prototype, '__CHEAT_YEP_SAVE_CORE_DRAW_TEXT_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _hookSaveInfoDrawTextEx(prototype, runtimeSource) {
        if (prototype.__CHEAT_YEP_SAVE_CORE_DRAW_TEXT_EX_PATCHED__) {
            return;
        }

        const original = prototype.drawTextEx;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateRenderedText = this._translateRenderedText.bind(this);

        prototype.drawTextEx = function (text, x, y) {
            const constructorName = this?.constructor?.name;
            if (constructorName !== 'Window_SaveInfo' && constructorName !== 'Window_SaveConfirm') {
                return original.call(this, text, x, y);
            }

            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return original.call(this, text, x, y);
            }

            const renderedText = translateRenderedText(text, runtime, runtimeSource);

            return original.call(this, renderedText, x, y);
        };

        Object.defineProperty(prototype, '__CHEAT_YEP_SAVE_CORE_DRAW_TEXT_EX_PATCHED__', {
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
                id: `plugin_yep_save_core_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
