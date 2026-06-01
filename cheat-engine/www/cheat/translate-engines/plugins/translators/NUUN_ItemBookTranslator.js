import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';

/**
 * NUUN_ItemBook translator.
 *
 * Supported plugin versions:
 * - NUUN_ItemBook.js v1.6.4 (MZ)
 *
 * Translation notes:
 * - Translatable strings are sourced from plugin parameters, including nested
 *   struct arrays for category labels, percent labels, and page definitions.
 * - Runtime translation uses stable display points only: menu command entries,
 *   item-book command windows, and percent-label rendering.
 */

const PLUGIN_NAME = 'NUUN_ItemBook';
const CACHE_TYPE = 'plugin_nuun_item_book';

const MENU_COMMAND_SYMBOL = 'itemBook';

const MENU_HOOK_FLAG = '__CHEAT_NUUN_ITEM_BOOK_MENU_HOOKED__';
const COMMAND_HOOK_FLAG = '__CHEAT_NUUN_ITEM_BOOK_COMMAND_HOOKED__';
const DRAW_TEXT_HOOK_FLAG = '__CHEAT_NUUN_ITEM_BOOK_DRAW_TEXT_HOOKED__';

const TOP_LEVEL_TEXT_KEYS = new Set(['CommandName', 'UnknownData', 'UnknownItemData']);
const NESTED_TEXT_KEYS = new Set([
    'CategoryName',
    'ContentName',
    'PageName',
    'ParamName',
    'paramName',
    'CommonText',
]);

const NESTED_PARAMETER_KEYS = [
    'ItemBookCategory',
    'PercentContent',
    'ItemPageSetting',
    'WeaponPageSetting',
    'ArmorPageSetting',
];

const COMMAND_WINDOW_CTORS = new Set(['Window_ItemBook_Category', 'Window_ItemBookPageCategory']);
const PERCENT_WINDOW_CTOR = 'Window_ItemBook_Percent';
const PAGE_WINDOW_CTOR = 'Window_ItemBookPageCategory';

export class NuunItemBookTranslator extends BasePluginTranslator {
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
        return 'NUUN ItemBook';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    _appendEntry(output, text, source) {
        if (!Array.isArray(output) || !this.isUsableText(text)) {
            return;
        }

        output.push({
            text: String(text),
            source,
        });
    }

    _appendParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const key of TOP_LEVEL_TEXT_KEYS) {
            this._appendEntry(output, parameters[key], {
                scope,
                field: key,
            });
        }

        for (const key of NESTED_PARAMETER_KEYS) {
            walkNestedJsonLike(parameters[key], (current, context) => {
                if (!current || typeof current !== 'object' || Array.isArray(current)) {
                    return;
                }

                for (const [field, value] of Object.entries(current)) {
                    if (!NESTED_TEXT_KEYS.has(field)) {
                        continue;
                    }

                    this._appendEntry(output, value, {
                        scope,
                        field,
                        parameter: key,
                        path: context.path,
                    });
                }
            });
        }
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this._appendParameterEntries(pluginEntry.parameters, 'pluginEntry', entries);
        }

        if (window.PluginManager?.parameters) {
            const runtimeParameters = window.PluginManager.parameters(this.getPluginName());
            this._appendParameterEntries(runtimeParameters, 'runtimeParameters', entries);
        }

        return entries;
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
                console.warn('[NUUN_ItemBookTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_nuun_item_book_${byCacheKey.size}`,
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
        const menuProto = window.Window_MenuCommand?.prototype;
        const commandProto = window.Window_Command?.prototype;
        const baseProto = window.Window_Base?.prototype;

        if (
            !menuProto ||
            typeof menuProto.addOriginalCommands !== 'function' ||
            !commandProto ||
            typeof commandProto.addCommand !== 'function' ||
            !baseProto ||
            typeof baseProto.drawText !== 'function'
        ) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const cacheType = this.getCacheType();

        if (!menuProto[MENU_HOOK_FLAG]) {
            const originalAddOriginalCommands = menuProto.addOriginalCommands;
            menuProto.addOriginalCommands = function () {
                originalAddOriginalCommands.apply(this, arguments);

                try {
                    const runtime = getRuntime();
                    if (!runtime || !Array.isArray(this._list)) {
                        return;
                    }

                    const command = this._list.find((entry) => entry?.symbol === MENU_COMMAND_SYMBOL);
                    const sourceText = String(command?.name || '');
                    if (!isUsableText(sourceText)) {
                        return;
                    }

                    const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                    runtime.trackCacheKeyUsage(cacheKey);

                    if (!isRuntimeTranslationActive(runtime)) {
                        return;
                    }

                    command.name = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                        requireRuntimeTranslationActive: true,
                        missValue: sourceText,
                        harvestMissing: false,
                    });
                } catch (error) {
                    console.warn('[NUUN_ItemBookTranslator] Failed to translate menu command', error);
                }
            };

            Object.defineProperty(menuProto, MENU_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        if (!commandProto[COMMAND_HOOK_FLAG]) {
            const originalAddCommand = commandProto.addCommand;
            commandProto.addCommand = function (name, symbol, enabled, ext) {
                let nextName = name;

                try {
                    const ctorName = String(this?.constructor?.name || '');
                    if (COMMAND_WINDOW_CTORS.has(ctorName) && isUsableText(name)) {
                        const runtime = getRuntime();
                        if (runtime) {
                            const sourceText = String(name);
                            const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                            runtime.trackCacheKeyUsage(cacheKey);

                            if (isRuntimeTranslationActive(runtime)) {
                                nextName = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                                    requireRuntimeTranslationActive: true,
                                    missValue: sourceText,
                                    harvestMissing: false,
                                });
                            }
                        }
                    }
                } catch (error) {
                    console.warn('[NUUN_ItemBookTranslator] Failed to translate command name', error);
                }

                return originalAddCommand.call(this, nextName, symbol, enabled, ext);
            };

            Object.defineProperty(commandProto, COMMAND_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        if (!baseProto[DRAW_TEXT_HOOK_FLAG]) {
            const originalDrawText = baseProto.drawText;
            baseProto.drawText = function (text, x, y, maxWidth, align) {
                let nextText = text;

                try {
                    const runtime = getRuntime();
                    if (!runtime || !isUsableText(text)) {
                        return originalDrawText.call(this, nextText, x, y, maxWidth, align);
                    }

                    const ctorName = String(this?.constructor?.name || '');

                    if (ctorName === PERCENT_WINDOW_CTOR) {
                        const sourceText = String(text);
                        const separatorIndex = sourceText.indexOf(' : ');
                        if (separatorIndex > 0) {
                            const sourceLabel = sourceText.slice(0, separatorIndex);
                            const tail = sourceText.slice(separatorIndex);
                            const cacheKey = runtime.getCacheKey(sourceLabel, cacheType);
                            runtime.trackCacheKeyUsage(cacheKey);

                            if (isRuntimeTranslationActive(runtime)) {
                                const translatedLabel = resolveRuntimeTranslation(
                                    sourceLabel,
                                    runtime,
                                    cacheType,
                                    {
                                        requireRuntimeTranslationActive: true,
                                        missValue: sourceLabel,
                                        harvestMissing: false,
                                    }
                                );
                                nextText = `${translatedLabel}${tail}`;
                            }
                        }
                    } else if (ctorName === PAGE_WINDOW_CTOR) {
                        const sourceText = String(text);
                        const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                        runtime.trackCacheKeyUsage(cacheKey);

                        if (isRuntimeTranslationActive(runtime)) {
                            nextText = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                                requireRuntimeTranslationActive: true,
                                missValue: sourceText,
                                harvestMissing: false,
                            });
                        }
                    }
                } catch (error) {
                    console.warn('[NUUN_ItemBookTranslator] Failed to translate drawText payload', error);
                }

                return originalDrawText.call(this, nextText, x, y, maxWidth, align);
            };

            Object.defineProperty(baseProto, DRAW_TEXT_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        return true;
    }
}
