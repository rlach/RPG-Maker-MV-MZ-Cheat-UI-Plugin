import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';

/**
 * NUUN_EnemyBook translator.
 *
 * Supported plugin versions:
 * - NUUN_EnemyBook.js v2.20.9 (MZ)
 *
 * Translation notes:
 * - Translatable strings are gathered from plugin parameters, including nested
 *   category/page/percent structures.
 * - Runtime translation is applied at command-add and draw points that render
 *   plugin-owned labels, while preserving command symbols and behavior.
 */

const PLUGIN_NAME = 'NUUN_EnemyBook';
const CACHE_TYPE = 'plugin_nuun_enemy_book';

const MENU_SYMBOLS = new Set(['enemyBook', 'enemyBookInfo']);

const MENU_HOOK_FLAG = '__CHEAT_NUUN_ENEMY_BOOK_MENU_HOOKED__';
const COMMAND_HOOK_FLAG = '__CHEAT_NUUN_ENEMY_BOOK_COMMAND_HOOKED__';
const DRAW_TEXT_HOOK_FLAG = '__CHEAT_NUUN_ENEMY_BOOK_DRAW_TEXT_HOOKED__';

const TOP_LEVEL_TEXT_KEYS = new Set([
    'CommandName',
    'EnemyInfoCommandName',
    'NoDataName',
    'CategoryUnknownData',
    'UnknownData',
    'UnknownStatus',
    'UnknownItems',
]);

const NESTED_TEXT_KEYS = new Set([
    'CategoryName',
    'PageCategoryName',
    'ContentName',
    'Name',
    'ParamName',
    'paramName',
    'Text',
]);

const NESTED_PARAMETER_KEYS = [
    'EnemyBookCategory',
    'PercentContent',
    'PageSetting',
    'InfoPageSetting',
    'AnalyzeListData',
    'CategoryListDateSetting',
];

const COMMAND_WINDOW_CTORS = new Set(['Window_EnemyBook_Category', 'Window_EnemyBookPage']);
const PERCENT_WINDOW_CTOR = 'Window_EnemyBook_Percent';

export class NUUN_EnemyBookTranslator extends BasePluginTranslator {
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
        return 'NUUN EnemyBook';
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
                console.warn('[NUUN_EnemyBookTranslator] Scan failed', error);
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
                    id: `plugin_nuun_enemy_book_${byCacheKey.size}`,
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
                const result = originalAddOriginalCommands.apply(this, arguments);

                try {
                    const runtime = getRuntime();
                    if (!runtime || !Array.isArray(this._list)) {
                        return result;
                    }

                    for (const command of this._list) {
                        if (!MENU_SYMBOLS.has(command?.symbol)) {
                            continue;
                        }

                        const sourceText = String(command?.name || '');
                        if (!isUsableText(sourceText)) {
                            continue;
                        }

                        const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                        runtime.trackCacheKeyUsage(cacheKey);

                        if (!isRuntimeTranslationActive(runtime)) {
                            continue;
                        }

                        command.name = resolveRuntimeTranslation(sourceText, runtime, cacheType, {
                            requireRuntimeTranslationActive: true,
                            missValue: sourceText,
                            harvestMissing: false,
                        });
                    }
                } catch (error) {
                    console.warn(
                        '[NUUN_EnemyBookTranslator] Failed to translate menu commands',
                        error
                    );
                }

                return result;
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
                    const shouldTranslate =
                        COMMAND_WINDOW_CTORS.has(ctorName) ||
                        (ctorName === 'Window_PartyCommand' &&
                            MENU_SYMBOLS.has(String(symbol || '')));

                    if (shouldTranslate && isUsableText(name)) {
                        const runtime = getRuntime();
                        if (runtime) {
                            const sourceText = String(name);
                            const cacheKey = runtime.getCacheKey(sourceText, cacheType);
                            runtime.trackCacheKeyUsage(cacheKey);

                            if (isRuntimeTranslationActive(runtime)) {
                                nextName = resolveRuntimeTranslation(
                                    sourceText,
                                    runtime,
                                    cacheType,
                                    {
                                        requireRuntimeTranslationActive: true,
                                        missValue: sourceText,
                                        harvestMissing: false,
                                    }
                                );
                            }
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[NUUN_EnemyBookTranslator] Failed to translate command name',
                        error
                    );
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
                    }
                } catch (error) {
                    console.warn(
                        '[NUUN_EnemyBookTranslator] Failed to translate drawText payload',
                        error
                    );
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
