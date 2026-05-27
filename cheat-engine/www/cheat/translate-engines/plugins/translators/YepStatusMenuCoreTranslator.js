import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * YEP_StatusMenuCore translator
 *
 * Plugin: YEP_StatusMenuCore.js
 * Supported versions:
 * - v1.04 (MV): status scene command labels, headers, and attribute display names.
 *
 * Notes:
 * - Translatable strings are sourced from plugin parameters that become
 *   Yanfly.Param.Status* labels in runtime.
 * - Runtime hooks target YEP status-menu owned windows only:
 *   Window_StatusCommand command list generation and Window_StatusInfo text draw.
 */

const PLUGIN_NAME = 'YEP_StatusMenuCore';
const CACHE_TYPE = 'plugin_yep_status_menu_core';

const TRANSLATABLE_PARAMETER_KEYS = Object.freeze([
    'General Command',
    'Parameters Text',
    'Experience Text',
    'Total Format',
    'Parameters Command',
    'Graph Text',
    'Elements Command',
    'States Command',
    'Attributes Command',
    'hit Name',
    'eva Name',
    'cri Name',
    'cev Name',
    'mev Name',
    'mrf Name',
    'cnt Name',
    'hrg Name',
    'mrg Name',
    'trg Name',
    'tgr Name',
    'grd Name',
    'rec Name',
    'pha Name',
    'mcr Name',
    'tcr Name',
    'pdr Name',
    'mdr Name',
    'fdr Name',
    'exr Name',
]);

export class YepStatusMenuCoreTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownTexts = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'YEP StatusMenuCore';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getRuntimeParameters() {
        const pluginManager = window.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
            return null;
        }

        return parameters;
    }

    appendParameterEntries(output, parameters, scope) {
        if (!Array.isArray(output) || !parameters || typeof parameters !== 'object') {
            return;
        }

        for (const key of TRANSLATABLE_PARAMETER_KEYS) {
            const text = parameters[key];
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text: String(text),
                source: {
                    scope,
                    field: key,
                },
            });
        }
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.appendParameterEntries(entries, pluginEntry.parameters, 'pluginEntryParameters');
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.appendParameterEntries(entries, runtimeParameters, 'runtimePluginParameters');
        }

        return entries;
    }

    getKnownTexts() {
        if (this._knownTexts instanceof Set) {
            return this._knownTexts;
        }

        const sourceEntries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const known = new Set();

        for (const entry of sourceEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            known.add(String(text));
        }

        this._knownTexts = known;
        return known;
    }

    translateKnownText(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceText = String(text);
        if (!this.getKnownTexts().has(sourceText)) {
            return sourceText;
        }

        return this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
        });
    }

    installCommandWindowHook() {
        const klass = window.Window_StatusCommand;
        if (!klass?.prototype || typeof klass.prototype.makeCommandList !== 'function') {
            return false;
        }

        if (klass.prototype.__CHEAT_YEP_STATUS_MENU_CORE_MAKE_COMMAND_LIST_HOOKED__) {
            return true;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateKnownText = this.translateKnownText.bind(this);

        const originalMakeCommandList = klass.prototype.makeCommandList;
        klass.prototype.makeCommandList = function () {
            const result = originalMakeCommandList.apply(this, arguments);

            try {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime) || !Array.isArray(this._list)) {
                    return result;
                }

                for (const command of this._list) {
                    if (!command || !('name' in command)) {
                        continue;
                    }

                    command.name = translateKnownText(command.name, runtime);
                }
            } catch (error) {
                console.warn(
                    '[YepStatusMenuCoreTranslator] Failed to translate status command list',
                    error
                );
            }

            return result;
        };

        klass.prototype.__CHEAT_YEP_STATUS_MENU_CORE_MAKE_COMMAND_LIST_HOOKED__ = true;
        return true;
    }

    installStatusInfoTextHooks() {
        const klass = window.Window_StatusInfo;
        if (!klass?.prototype) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const translateKnownText = this.translateKnownText.bind(this);

        if (
            typeof klass.prototype.drawText === 'function' &&
            !klass.prototype.__CHEAT_YEP_STATUS_MENU_CORE_DRAW_TEXT_HOOKED__
        ) {
            const originalDrawText = klass.prototype.drawText;
            klass.prototype.drawText = function () {
                try {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime) && arguments.length > 0) {
                        arguments[0] = translateKnownText(arguments[0], runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[YepStatusMenuCoreTranslator] Failed to translate status info drawText',
                        error
                    );
                }

                return originalDrawText.apply(this, arguments);
            };

            klass.prototype.__CHEAT_YEP_STATUS_MENU_CORE_DRAW_TEXT_HOOKED__ = true;
        }

        if (
            typeof klass.prototype.drawTextEx === 'function' &&
            !klass.prototype.__CHEAT_YEP_STATUS_MENU_CORE_DRAW_TEXT_EX_HOOKED__
        ) {
            const originalDrawTextEx = klass.prototype.drawTextEx;
            klass.prototype.drawTextEx = function () {
                try {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime) && arguments.length > 0) {
                        arguments[0] = translateKnownText(arguments[0], runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[YepStatusMenuCoreTranslator] Failed to translate status info drawTextEx',
                        error
                    );
                }

                return originalDrawTextEx.apply(this, arguments);
            };

            klass.prototype.__CHEAT_YEP_STATUS_MENU_CORE_DRAW_TEXT_EX_HOOKED__ = true;
        }

        if (
            typeof klass.prototype.drawGeneralExp === 'function' &&
            !klass.prototype.__CHEAT_YEP_STATUS_MENU_CORE_DRAW_GENERAL_EXP_HOOKED__
        ) {
            const originalDrawGeneralExp = klass.prototype.drawGeneralExp;
            klass.prototype.drawGeneralExp = function () {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return originalDrawGeneralExp.apply(this, arguments);
                }

                const originalTemplate = window.Yanfly?.Param?.StatusTotalFmt;
                const translatedTemplate = translateKnownText(originalTemplate, runtime);
                if (!isUsableText(originalTemplate)) {
                    return originalDrawGeneralExp.apply(this, arguments);
                }

                if (translatedTemplate === originalTemplate) {
                    return originalDrawGeneralExp.apply(this, arguments);
                }

                window.Yanfly.Param.StatusTotalFmt = translatedTemplate;
                try {
                    return originalDrawGeneralExp.apply(this, arguments);
                } finally {
                    window.Yanfly.Param.StatusTotalFmt = originalTemplate;
                }
            };

            klass.prototype.__CHEAT_YEP_STATUS_MENU_CORE_DRAW_GENERAL_EXP_HOOKED__ = true;
        }

        return true;
    }

    enablePluginTranslation() {
        const commandHookReady =
            !!window.Window_StatusCommand?.prototype &&
            typeof window.Window_StatusCommand.prototype.makeCommandList === 'function';
        const statusInfoReady = !!window.Window_StatusInfo?.prototype;

        if (!commandHookReady && !statusInfoReady) {
            return false;
        }

        const commandHookInstalled = this.installCommandWindowHook();
        const statusInfoHooksInstalled = this.installStatusInfoTextHooks();

        return commandHookInstalled || statusInfoHooksInstalled;
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
                this._knownTexts = null;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[YepStatusMenuCoreTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildUniquePendingItems(runtime) {
        const entries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const byCacheKey = new Map();

        for (const entry of entries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_yep_status_menu_core_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
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