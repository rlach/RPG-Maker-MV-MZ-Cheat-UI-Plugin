import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/*
 * MKR_MapItemSlot (マンカインド) translator.
 *
 * Supported versions:
 * - MV v1.2.11
 *
 * Translation notes:
 * - This plugin stores user-facing labels/help strings in plugin parameters.
 * - Runtime hook points are command/help rendering paths:
 *   - Window_Command.prototype.addCommand for menu/slot command labels.
 *   - Window_Help.prototype.setText for slot command help text in Scene_ItemSlot.
 * - Plugin command tokens (itemslot, set/remove/menu/use/select, etc.) are preserved as literals.
 */

const CACHE_TYPE = 'plugin_mkr_map_item_slot';
const RUNTIME_HOOK_GUARD = '__CHEAT_MKR_MAP_ITEM_SLOT_TRANSLATOR_HOOKED__';
const MENU_SYMBOL = 'itemslot';
const SLOT_COMMAND_WINDOW_NAME = 'Window_SlotCommand';
const ITEM_SLOT_SCENE_NAME = 'Scene_ItemSlot';

const TRANSLATABLE_PARAM_FIELDS = [
    'Menu_Slot_Name',
    'Slot_Set_Name',
    'Slot_Remove_Name',
    'Slot_Set_Desc',
    'Slot_Remove_Desc',
];

function decodeParameterText(rawValue) {
    const parsed = parseJsonSafely(rawValue, rawValue);
    return typeof parsed === 'string' ? parsed : '';
}

export class MkrMapItemSlotTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._runtimeTrackableTexts = new Set();
    }

    getPluginName() {
        return 'MKR_MapItemSlot';
    }

    getPluginLabel() {
        return 'MKR_MapItemSlot';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    collectParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        for (const field of TRANSLATABLE_PARAM_FIELDS) {
            const decoded = decodeParameterText(parameters[field]);
            if (!this.isUsableText(decoded)) {
                continue;
            }

            output.push({
                text: decoded,
                source: {
                    scope,
                    field,
                },
            });
        }
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.collectParameterEntries(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        if (window.PluginManager && typeof window.PluginManager.parameters === 'function') {
            const runtimeParameters = window.PluginManager.parameters(this.getPluginName());
            this.collectParameterEntries(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    ensureScanEntriesPreparedSync() {
        if (this._scanPrepared) {
            return;
        }

        this._scanEntries = this.buildScanEntries();
        this._runtimeTrackableTexts = new Set(
            this._scanEntries
                .map((entry) => String(entry?.text || ''))
                .filter((text) => this.isUsableText(text))
        );
        this._scanPrepared = true;
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
                this.ensureScanEntriesPreparedSync();
            })
            .catch((error) => {
                console.warn('[MkrMapItemSlotTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildUniquePendingItems(runtime) {
        this.ensureScanEntriesPreparedSync();

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
                id: `plugin_mkr_map_item_slot_${byCacheKey.size}`,
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

    isItemSlotSceneActive() {
        const currentSceneName = String(window.SceneManager?._scene?.constructor?.name || '');
        return currentSceneName === ITEM_SLOT_SCENE_NAME;
    }

    shouldTranslateCommandName(windowInstance, symbol) {
        if (String(symbol || '') === MENU_SYMBOL) {
            return true;
        }

        const windowName = String(windowInstance?.constructor?.name || '');
        return windowName === SLOT_COMMAND_WINDOW_NAME;
    }

    shouldTranslateHelpText(text) {
        if (!this.isItemSlotSceneActive()) {
            return false;
        }

        this.ensureScanEntriesPreparedSync();
        return this._runtimeTrackableTexts.has(String(text || ''));
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return true;
        }

        if (
            !window.Window_Command ||
            !Window_Command.prototype ||
            typeof Window_Command.prototype.addCommand !== 'function'
        ) {
            return false;
        }

        if (
            !window.Window_Help ||
            !Window_Help.prototype ||
            typeof Window_Help.prototype.setText !== 'function'
        ) {
            return false;
        }

        const originalAddCommand = Window_Command.prototype.addCommand;
        const originalSetText = Window_Help.prototype.setText;

        Window_Command.prototype.addCommand = ((pluginTranslator) => {
            return function (name, symbol, enabled, ext) {
                try {
                    if (pluginTranslator.shouldTranslateCommandName(this, symbol)) {
                        const runtime = pluginTranslator.getRuntime();
                        arguments[0] = pluginTranslator.resolveRuntimeTranslation(
                            name,
                            runtime,
                            pluginTranslator.getCacheType(),
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: name,
                            }
                        );
                    }
                } catch (error) {
                    console.warn(
                        '[MkrMapItemSlotTranslator] Failed to translate command label at runtime',
                        error
                    );
                }

                return originalAddCommand.apply(this, arguments);
            };
        })(this);

        Window_Help.prototype.setText = ((pluginTranslator) => {
            return function (text) {
                try {
                    if (pluginTranslator.shouldTranslateHelpText(text)) {
                        const runtime = pluginTranslator.getRuntime();
                        arguments[0] = pluginTranslator.resolveRuntimeTranslation(
                            text,
                            runtime,
                            pluginTranslator.getCacheType(),
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: text,
                            }
                        );
                    }
                } catch (error) {
                    console.warn(
                        '[MkrMapItemSlotTranslator] Failed to translate help text at runtime',
                        error
                    );
                }

                return originalSetText.apply(this, arguments);
            };
        })(this);

        window[RUNTIME_HOOK_GUARD] = true;
        return true;
    }
}
