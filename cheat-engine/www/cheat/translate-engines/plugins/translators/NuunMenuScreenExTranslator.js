import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const NUUN_FALLBACK_STATUS_LABELS = [
    '会心率',
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
];

/**
 * Translator for NUUN_MenuScreenEX.
 *
 * Supported versions:
 * - 3.1.13+ (MZ)
 *
 * Notes:
 * - Translatable text is primarily stored in plugin parameters (`HelpList`, `MenuLayout` nested
 *   `StatusList` and `PageList1..10` structures).
 * - `HelpCommandName` is used as a lookup token against menu command names and is intentionally
 *   not translated by this translator.
 */
export class NuunMenuScreenExTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownRuntimeSourceTexts = new Set();
    }

    getPluginName() {
        return 'NUUN_MenuScreenEX';
    }

    getPluginLabel() {
        return 'NUUN MenuScreenEX';
    }

    getCacheType() {
        return 'plugin_nuun_menu_screen_ex';
    }

    appendEntry(output, text, source) {
        if (!this.isUsableText(text) || !Array.isArray(output)) {
            return;
        }

        output.push({ text, source });
    }

    parseStructArray(rawValue) {
        const parsed = parseJsonSafely(rawValue, []);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((entry) => parseJsonSafely(entry, entry))
            .filter((entry) => entry && typeof entry === 'object');
    }

    collectHelpListEntries(parameters, output) {
        const helpItems = this.parseStructArray(parameters.HelpList);

        for (let idx = 0; idx < helpItems.length; idx++) {
            const item = helpItems[idx];
            const helpText = typeof item.HelpCommandText === 'string' ? item.HelpCommandText : '';

            this.appendEntry(output, helpText, {
                scope: 'pluginParam',
                param: 'HelpList',
                index: idx,
                field: 'HelpCommandText',
            });
        }
    }

    collectLayoutStatusEntries(layout, layoutIndex, output) {
        const statusItems = this.parseStructArray(layout.StatusList);
        for (let statusIndex = 0; statusIndex < statusItems.length; statusIndex++) {
            const status = statusItems[statusIndex];
            const paramName = typeof status.ParamName === 'string' ? status.ParamName : '';

            this.appendEntry(output, paramName, {
                scope: 'pluginParam',
                param: 'MenuLayout',
                layoutIndex,
                list: 'StatusList',
                index: statusIndex,
                field: 'ParamName',
            });
        }
    }

    collectLayoutPageListEntries(layout, layoutIndex, output) {
        for (let page = 1; page <= 10; page++) {
            const listKey = `PageList${page}`;
            const pageItems = this.parseStructArray(layout[listKey]);

            for (let itemIndex = 0; itemIndex < pageItems.length; itemIndex++) {
                const item = pageItems[itemIndex];
                const paramName = typeof item.ParamName === 'string' ? item.ParamName : '';
                const freeText = typeof item.Text === 'string' ? item.Text : '';

                this.appendEntry(output, paramName, {
                    scope: 'pluginParam',
                    param: 'MenuLayout',
                    layoutIndex,
                    list: listKey,
                    index: itemIndex,
                    field: 'ParamName',
                });

                this.appendEntry(output, freeText, {
                    scope: 'pluginParam',
                    param: 'MenuLayout',
                    layoutIndex,
                    list: listKey,
                    index: itemIndex,
                    field: 'Text',
                });
            }
        }
    }

    collectMenuLayoutEntries(parameters, output) {
        const layouts = this.parseStructArray(parameters.MenuLayout);

        for (let layoutIndex = 0; layoutIndex < layouts.length; layoutIndex++) {
            const layout = layouts[layoutIndex];
            this.collectLayoutStatusEntries(layout, layoutIndex, output);
            this.collectLayoutPageListEntries(layout, layoutIndex, output);
        }
    }

    collectBuiltInFallbackEntries(output) {
        for (let index = 0; index < NUUN_FALLBACK_STATUS_LABELS.length; index++) {
            this.appendEntry(output, NUUN_FALLBACK_STATUS_LABELS[index], {
                scope: 'pluginBuiltin',
                section: 'statusFallbackLabel',
                index,
            });
        }
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
                this._knownRuntimeSourceTexts.clear();
                for (const entry of this._scanEntries) {
                    if (this.isUsableText(entry?.text)) {
                        this._knownRuntimeSourceTexts.add(entry.text);
                    }
                }
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[NuunMenuScreenExTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        const pluginEntry = this.findPluginEntry();
        const parameters = pluginEntry?.parameters;

        if (!parameters || typeof parameters !== 'object') {
            return entries;
        }

        this.collectHelpListEntries(parameters, entries);
        this.collectMenuLayoutEntries(parameters, entries);
        this.collectBuiltInFallbackEntries(entries);

        return entries;
    }

    resolveRuntimeText(text, runtime) {
        return this.resolveRuntimeTextWithOptions(text, runtime);
    }

    resolveRuntimeTextWithOptions(text, runtime, { onlyKnown = false } = {}) {
        if (!this.isUsableText(text)) {
            return text;
        }

        if (onlyKnown && !this._knownRuntimeSourceTexts.has(text)) {
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, this.getCacheType());
        runtime.trackCacheKeyUsage(cacheKey);

        if (!this.isRuntimeTranslationActive(runtime) || !runtime.hasUsableCacheValue(cacheKey)) {
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return this.isUsableText(cached) ? cached : text;
    }

    applyTranslatedParamFields(data, runtime) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        const translated = { ...data };
        if (typeof translated.ParamName === 'string') {
            translated.ParamName = this.resolveRuntimeText(translated.ParamName, runtime);
        }

        if (typeof translated.Text === 'string') {
            translated.Text = this.resolveRuntimeText(translated.Text, runtime);
        }

        return translated;
    }

    enablePluginTranslation() {
        const getRuntime = this.getRuntime.bind(this);
        const applyTranslatedParamFields = this.applyTranslatedParamFields.bind(this);
        const resolveRuntimeTextWithOptions = this.resolveRuntimeTextWithOptions.bind(this);

        const canHookStatusBase =
            !!window.Window_StatusBase &&
            !!Window_StatusBase.prototype &&
            typeof Window_StatusBase.prototype.nuunMenu_drawContentsBase === 'function';
        const canHookInfoDrawContents =
            !!window.Window_InfoMenu &&
            !!Window_InfoMenu.prototype &&
            typeof Window_InfoMenu.prototype.nuun_DrawContents === 'function';
        const canHookInfoSetText =
            !!window.Window_InfoMenu &&
            !!Window_InfoMenu.prototype &&
            typeof Window_InfoMenu.prototype.setText === 'function';
        const canHookDrawText =
            !!window.Window_Base &&
            !!Window_Base.prototype &&
            typeof Window_Base.prototype.drawText === 'function';
        const canHookDrawTextEx =
            !!window.Window_Base &&
            !!Window_Base.prototype &&
            typeof Window_Base.prototype.drawTextEx === 'function';

        if (
            !canHookStatusBase &&
            !canHookInfoDrawContents &&
            !canHookInfoSetText &&
            !canHookDrawText &&
            !canHookDrawTextEx
        ) {
            return false;
        }

        if (canHookStatusBase) {
            const originalDrawContentsBase = Window_StatusBase.prototype.nuunMenu_drawContentsBase;

            Window_StatusBase.prototype.nuunMenu_drawContentsBase = function (
                data,
                x,
                y,
                width,
                battler
            ) {
                try {
                    const runtime = getRuntime();
                    if (runtime) {
                        arguments[0] = applyTranslatedParamFields(data, runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[NuunMenuScreenExTranslator] Failed to apply runtime status translation',
                        error
                    );
                }

                return originalDrawContentsBase.apply(this, arguments);
            };
        }

        if (canHookInfoDrawContents) {
            const originalDrawInfoContents = Window_InfoMenu.prototype.nuun_DrawContents;

            Window_InfoMenu.prototype.nuun_DrawContents = function (data, x, y, width, battler) {
                try {
                    const runtime = getRuntime();
                    if (runtime) {
                        arguments[0] = applyTranslatedParamFields(data, runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[NuunMenuScreenExTranslator] Failed to apply runtime info translation',
                        error
                    );
                }

                return originalDrawInfoContents.apply(this, arguments);
            };
        }

        if (canHookInfoSetText) {
            const originalSetText = Window_InfoMenu.prototype.setText;

            Window_InfoMenu.prototype.setText = function (str) {
                try {
                    const runtime = getRuntime();
                    if (runtime && typeof str === 'string') {
                        arguments[0] = resolveRuntimeTextWithOptions(str, runtime, {
                            onlyKnown: true,
                        });
                    }
                } catch (error) {
                    console.warn(
                        '[NuunMenuScreenExTranslator] Failed to apply runtime help text translation',
                        error
                    );
                }

                return originalSetText.apply(this, arguments);
            };
        }

        if (canHookDrawText) {
            const originalDrawText = Window_Base.prototype.drawText;

            Window_Base.prototype.drawText = function (text, x, y, maxWidth, align) {
                try {
                    const runtime = getRuntime();
                    if (runtime && typeof text === 'string') {
                        arguments[0] = resolveRuntimeTextWithOptions(text, runtime, {
                            onlyKnown: true,
                        });
                    }
                } catch (error) {
                    console.warn(
                        '[NuunMenuScreenExTranslator] Failed to apply drawText runtime translation',
                        error
                    );
                }

                return originalDrawText.apply(this, arguments);
            };
        }

        if (canHookDrawTextEx) {
            const originalDrawTextEx = Window_Base.prototype.drawTextEx;

            Window_Base.prototype.drawTextEx = function (text, x, y, width) {
                try {
                    const runtime = getRuntime();
                    if (runtime && typeof text === 'string') {
                        arguments[0] = resolveRuntimeTextWithOptions(text, runtime, {
                            onlyKnown: true,
                        });
                    }
                } catch (error) {
                    console.warn(
                        '[NuunMenuScreenExTranslator] Failed to apply drawTextEx runtime translation',
                        error
                    );
                }

                return originalDrawTextEx.apply(this, arguments);
            };
        }

        return true;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_nuun_menu_screen_ex_${byCacheKey.size}`,
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
