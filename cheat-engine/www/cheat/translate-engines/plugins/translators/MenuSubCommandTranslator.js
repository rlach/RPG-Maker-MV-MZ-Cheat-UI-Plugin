import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const CACHE_TYPE = 'plugin_menu_sub_command';
const SUB_COMMAND_HOOK_FLAG = '__CHEAT_MENU_SUB_COMMAND_TRANSLATION_PATCHED__';
const INSTANCE_HOOK_FLAG = '__CHEAT_MENU_SUB_COMMAND_INSTANCE_PATCHED__';

/**
 * MenuSubCommandTranslator
 *
 * Plugin: MenuSubCommand.js (Triacontane)
 * Supported versions:
 * - v4.1.1 (MZ; plugin header declares @target MZ)
 *
 * Translatable surfaces:
 * - Plugin parameter subCommands[].Name
 * - Plugin parameter subCommands[].ParentName
 *
 * Notes:
 * - Script payloads and command tokens are not translated to preserve command syntax.
 * - Runtime translation is applied by patching MenuSubCommand runtime instances created by Game_Temp.
 */
export class MenuSubCommandTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'MenuSubCommand';
    }

    getPluginLabel() {
        return 'MenuSubCommand';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    parseSubCommandArray(parameters) {
        const parsed = parseJsonSafely(parameters?.subCommands, []);
        if (!Array.isArray(parsed)) {
            return [];
        }

        const result = [];
        for (const item of parsed) {
            const entry = parseJsonSafely(item, null);
            if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
                result.push(entry);
            }
        }

        return result;
    }

    appendEntriesFromParameters(parameters, scope, output) {
        const subCommands = this.parseSubCommandArray(parameters);
        for (let index = 0; index < subCommands.length; index++) {
            const command = subCommands[index];

            const name = typeof command.Name === 'string' ? command.Name : '';
            if (this.isUsableText(name)) {
                output.push({
                    text: name,
                    source: {
                        scope,
                        field: 'subCommands',
                        index,
                        part: 'Name',
                    },
                });
            }

            const parentName = typeof command.ParentName === 'string' ? command.ParentName : '';
            if (this.isUsableText(parentName)) {
                output.push({
                    text: parentName,
                    source: {
                        scope,
                        field: 'subCommands',
                        index,
                        part: 'ParentName',
                    },
                });
            }
        }
    }

    patchSubCommandInstance(subCommand) {
        if (!subCommand || subCommand[INSTANCE_HOOK_FLAG]) {
            return;
        }

        if (
            typeof subCommand.getName !== 'function' ||
            typeof subCommand.getParentName !== 'function' ||
            typeof subCommand.getSelectionScript !== 'function'
        ) {
            return;
        }

        const originalGetName = subCommand.getName;
        const originalGetParentName = subCommand.getParentName;

        subCommand.getName = (...args) => {
            const originalText = originalGetName.apply(subCommand, args);
            return this.resolveRuntimeTranslation(
                originalText,
                this.getRuntime(),
                this.getCacheType(),
                {
                    requireRuntimeTranslationActive: true,
                    missValue: originalText,
                }
            );
        };

        subCommand.getParentName = (...args) => {
            const originalText = originalGetParentName.apply(subCommand, args);
            return this.resolveRuntimeTranslation(
                originalText,
                this.getRuntime(),
                this.getCacheType(),
                {
                    requireRuntimeTranslationActive: true,
                    missValue: originalText,
                }
            );
        };

        Object.defineProperty(subCommand, INSTANCE_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    patchExistingSubCommandInstances(gameTemp) {
        gameTemp.iterateMenuParents((subCommands) => {
            if (!Array.isArray(subCommands)) {
                return;
            }

            for (const subCommand of subCommands) {
                this.patchSubCommandInstance(subCommand);
            }
        });
    }

    enablePluginTranslation() {
        const gameTempPrototype = window.Game_Temp?.prototype;
        if (!gameTempPrototype || typeof gameTempPrototype.createMenuCommand !== 'function') {
            return false;
        }

        const patchSubCommandInstance = this.patchSubCommandInstance.bind(this);

        if (!gameTempPrototype[SUB_COMMAND_HOOK_FLAG]) {
            const originalCreateMenuCommand = gameTempPrototype.createMenuCommand;

            gameTempPrototype.createMenuCommand = function (commands) {
                originalCreateMenuCommand.apply(this, arguments);

                const parentName = `${commands?.ParentName ?? ''}${commands?.CommandId ?? ''}`;
                const subCommands = this._menuParentCommands?.get(parentName);
                if (!Array.isArray(subCommands) || subCommands.length === 0) {
                    return;
                }

                const latestSubCommand = subCommands.slice(-1)[0];
                patchSubCommandInstance(latestSubCommand);
            };

            Object.defineProperty(gameTempPrototype, SUB_COMMAND_HOOK_FLAG, {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        if (window.$gameTemp && typeof window.$gameTemp.iterateMenuParents === 'function') {
            this.patchExistingSubCommandInstances(window.$gameTemp);
        }

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
                console.warn('[MenuSubCommandTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        const runtimeParameters = window.PluginManager?.parameters?.(this.getPluginName());
        if (runtimeParameters) {
            this.appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
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
                    id: `plugin_menu_sub_command_${byCacheKey.size}`,
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
