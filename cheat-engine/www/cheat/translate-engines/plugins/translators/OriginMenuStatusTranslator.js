import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_ORIGIN_MENU_STATUS_TRANSLATOR_HOOKED__';
const ORIGIN_PLUGIN_NAME = 'OriginMenuStatus';
const ORIGIN_MENU_SYMBOL = 'origin_menu_status';
const SET_PARAM_COMMAND = 'SetParam';
const CACHE_TYPE = 'plugin_origin_menu_status';

const PARAM_FIELDS = [
    'command_name',
    'param_name_1',
    'param_name_2',
    'param_name_3',
    'param_name_4',
    'param_name_5',
    'param_name_6',
    'param_name_7',
    'param_name_8',
    'param_name_9',
    'param_name_10',
];

function parseParamFieldCsv(rawValue) {
    const parts = String(rawValue || '').split(',');
    return {
        name: parts.length > 0 ? String(parts[0] || '') : '',
        value: parts.length > 1 ? String(parts[1] || '') : '',
        afterName: parts.length > 2 ? String(parts[2] || '') : '',
    };
}

function parseOriginSetParamCommandLine(commandLine) {
    const parts = String(commandLine || '').split(' ');
    const command = String(parts.shift() || '').trim();
    const subCommand = String(parts.shift() || '').trim();
    const paramKey = String(parts.shift() || '').trim();
    const value = String(parts.shift() || '');

    if (command?.toLowerCase() !== ORIGIN_PLUGIN_NAME.toLowerCase()) {
        return null;
    }

    if (subCommand !== SET_PARAM_COMMAND) {
        return null;
    }

    if (!/^param(?:10|[1-9])$/i.test(paramKey)) {
        return null;
    }

    if (!(typeof value === 'string' && value.trim() !== '')) {
        return null;
    }

    return {
        command,
        subCommand,
        paramKey,
        value,
    };
}

export class OriginMenuStatusTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return ORIGIN_PLUGIN_NAME;
    }

    getPluginLabel() {
        return ORIGIN_PLUGIN_NAME;
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    appendPluginParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const field of PARAM_FIELDS) {
            const raw = typeof parameters[field] === 'string' ? parameters[field] : '';
            if (!this.isUsableText(raw)) {
                continue;
            }

            if (field === 'command_name') {
                output.push({
                    text: raw,
                    source: {
                        scope,
                        field,
                        part: 'commandName',
                    },
                });
                continue;
            }

            const parsed = parseParamFieldCsv(raw);
            if (this.isUsableText(parsed.name)) {
                output.push({
                    text: parsed.name,
                    source: {
                        scope,
                        field,
                        part: 'name',
                    },
                });
            }

            if (this.isUsableText(parsed.value)) {
                output.push({
                    text: parsed.value,
                    source: {
                        scope,
                        field,
                        part: 'value',
                    },
                });
            }

            if (this.isUsableText(parsed.afterName)) {
                output.push({
                    text: parsed.afterName,
                    source: {
                        scope,
                        field,
                        part: 'afterName',
                    },
                });
            }
        }
    }

    patchOriginBaseWindowInstance(windowInstance) {
        if (!windowInstance || typeof windowInstance !== 'object') {
            return;
        }

        if (windowInstance.__CHEAT_ORIGIN_MENU_STATUS_WINDOW_PATCHED__) {
            return;
        }

        if (
            typeof windowInstance.DrawParameterName !== 'function' ||
            typeof windowInstance.DrawParameterValue !== 'function' ||
            typeof windowInstance.GetFontSize !== 'function'
        ) {
            return;
        }

        const translator = this;
        const originalDrawParameterName = windowInstance.DrawParameterName;
        const originalDrawParameterValue = windowInstance.DrawParameterValue;

        windowInstance.DrawParameterName = function (message, x, y, length, align) {
            try {
                const runtime = translator.getRuntime();
                arguments[0] = translator.resolveRuntimeTranslation(message, runtime);
            } catch (error) {
                console.warn(
                    '[OriginMenuStatusTranslator] Failed to translate parameter name at runtime',
                    error
                );
            }

            return originalDrawParameterName.apply(this, arguments);
        };

        windowInstance.DrawParameterValue = function (message, x, y, length, afterName) {
            try {
                const runtime = translator.getRuntime();
                arguments[0] = translator.resolveRuntimeTranslation(message, runtime);
                arguments[4] = translator.resolveRuntimeTranslation(afterName, runtime);
            } catch (error) {
                console.warn(
                    '[OriginMenuStatusTranslator] Failed to translate parameter value at runtime',
                    error
                );
            }

            return originalDrawParameterValue.apply(this, arguments);
        };

        Object.defineProperty(windowInstance, '__CHEAT_ORIGIN_MENU_STATUS_WINDOW_PATCHED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return true;
        }

        const translator = this;

        const canHookPluginCommand =
            !!window.Game_Interpreter &&
            !!Game_Interpreter.prototype &&
            typeof Game_Interpreter.prototype.pluginCommand === 'function';
        const canHookAddOriginalCommands =
            !!window.Window_MenuCommand &&
            !!Window_MenuCommand.prototype &&
            typeof Window_MenuCommand.prototype.addOriginalCommands === 'function';
        const canHookAddWindow =
            !!window.Scene_Base &&
            !!Scene_Base.prototype &&
            typeof Scene_Base.prototype.addWindow === 'function';

        if (!canHookPluginCommand && !canHookAddOriginalCommands && !canHookAddWindow) {
            return false;
        }

        if (canHookPluginCommand) {
            const originalPluginCommand = Game_Interpreter.prototype.pluginCommand;

            Game_Interpreter.prototype.pluginCommand = function (command, args) {
                try {
                    if (
                        String(command || '').trim() === ORIGIN_PLUGIN_NAME &&
                        Array.isArray(args) &&
                        String(args[0] || '').trim() === SET_PARAM_COMMAND &&
                        translator.isUsableText(args[2])
                    ) {
                        const runtime = translator.getRuntime();
                        if (runtime) {
                            const translatedValue = translator.resolveRuntimeTranslation(
                                args[2],
                                runtime
                            );
                            if (translatedValue !== args[2]) {
                                const nextArgs = args.slice();
                                nextArgs[2] = translatedValue;
                                arguments[1] = nextArgs;
                            }
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[OriginMenuStatusTranslator] Failed to translate SetParam payload',
                        error
                    );
                }

                return originalPluginCommand.apply(this, arguments);
            };
        }

        if (canHookAddOriginalCommands) {
            const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;

            Window_MenuCommand.prototype.addOriginalCommands = function () {
                const result = originalAddOriginalCommands.apply(this, arguments);

                try {
                    if (Array.isArray(this._list)) {
                        const runtime = translator.getRuntime();

                        for (const command of this._list) {
                            if (command?.symbol !== ORIGIN_MENU_SYMBOL) {
                                continue;
                            }

                            command.name = translator.resolveRuntimeTranslation(
                                command.name,
                                runtime
                            );
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[OriginMenuStatusTranslator] Failed to translate menu command label',
                        error
                    );
                }

                return result;
            };
        }

        if (canHookAddWindow) {
            const originalAddWindow = Scene_Base.prototype.addWindow;

            Scene_Base.prototype.addWindow = function (windowInstance) {
                const result = originalAddWindow.apply(this, arguments);

                try {
                    translator.patchOriginBaseWindowInstance(windowInstance);
                } catch (error) {
                    console.warn(
                        '[OriginMenuStatusTranslator] Failed to patch OriginMenuStatus base window',
                        error
                    );
                }

                return result;
            };
        }

        window[RUNTIME_HOOK_GUARD] = true;
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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[OriginMenuStatusTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.appendPluginParameterEntries(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        const pluginManager = window.PluginManager;
        if (pluginManager && typeof pluginManager.parameters === 'function') {
            const runtimeParameters = pluginManager.parameters(this.getPluginName());
            this.appendPluginParameterEntries(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectOriginCommandsFromList(
                    commonEvent.list,
                    {
                        scope: 'commonEvent',
                        commonEventId,
                    },
                    entries
                );
            }
        }

        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
                    const event = mapData.events[eventIdx];
                    if (!event || !Array.isArray(event.pages)) {
                        continue;
                    }

                    for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                        const page = event.pages[pageIdx];
                        if (!page || !Array.isArray(page.list)) {
                            continue;
                        }

                        this.collectOriginCommandsFromList(
                            page.list,
                            {
                                scope: 'mapEvent',
                                mapId,
                                eventIdx,
                                pageIdx,
                            },
                            entries
                        );
                    }
                }
            } catch (error) {
                console.warn(`[OriginMenuStatusTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectOriginCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 356) {
                continue;
            }

            const commandLine =
                Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === 'string'
                    ? cmd.parameters[0]
                    : '';

            const parsed = parseOriginSetParamCommandLine(commandLine);
            if (!parsed || !this.isUsableText(parsed.value)) {
                continue;
            }

            output.push({
                text: parsed.value,
                command: parsed.command,
                subCommand: parsed.subCommand,
                paramKey: parsed.paramKey,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });
        }
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
                    id: `plugin_origin_menu_status_${byCacheKey.size}`,
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
