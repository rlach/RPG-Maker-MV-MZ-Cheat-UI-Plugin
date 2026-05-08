import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_SKILL_CP_SYSTEM_TRANSLATOR_HOOKED__';
const CACHE_TYPE = 'plugin_skill_cp_system';
const COMMAND_CACHE_TYPE = 'command';

const MENU_TITLE_FIELD = 'Menu Skill Setting Title';
const PARAM_FIELDS = ['CP Name', 'Set Name', 'No Equip Slot Name', MENU_TITLE_FIELD];

export class SkillCPSystemTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'SkillCPSystem';
    }

    getPluginLabel() {
        return 'SkillCPSystem';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getCacheTypeByField(field) {
        if (field === MENU_TITLE_FIELD) {
            return COMMAND_CACHE_TYPE;
        }

        return this.getCacheType();
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = String(this.getPluginName() || '')
            .trim()
            .toLowerCase();
        if (!pluginName) {
            return null;
        }

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === pluginName;
            }) || null
        );
    }

    getRuntimeParameters() {
        const pluginManager = window.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        return parameters && typeof parameters === 'object' ? parameters : null;
    }

    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        for (const field of PARAM_FIELDS) {
            const text = typeof parameters[field] === 'string' ? parameters[field] : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    scope,
                    field,
                },
            });
        }
    }

    getSourceTextByField() {
        const result = new Map();

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry && pluginEntry.parameters && typeof pluginEntry.parameters === 'object') {
            for (const field of PARAM_FIELDS) {
                const value = pluginEntry.parameters[field];
                if (!result.has(field) && this.isUsableText(value)) {
                    result.set(field, value);
                }
            }
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            for (const field of PARAM_FIELDS) {
                const value = runtimeParameters[field];
                if (!result.has(field) && this.isUsableText(value)) {
                    result.set(field, value);
                }
            }
        }

        return result;
    }

    resolveRuntimeTranslation(text, field) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const runtime = this.getRuntime();
        if (
            !runtime
        ) {
            return text;
        }

        const cacheType = this.getCacheTypeByField(field);
        const cacheKey = runtime.getCacheKey(text, cacheType);

        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return isUsableText(cached) ? cached : text;
    }

    translateIfSkillCpField(text, fields) {
        if (!isUsableText(text) || !Array.isArray(fields) || fields.length === 0) {
            return text;
        }

        const byField = this.getSourceTextByField();
        for (const field of fields) {
            if (byField.get(field) === text) {
                return this.resolveRuntimeTranslation(text, field);
            }
        }

        return text;
    }

    patchMenuCommandRuntime() {
        if (
            !window.Window_MenuCommand ||
            !Window_MenuCommand.prototype ||
            typeof Window_MenuCommand.prototype.addOriginalCommands !== 'function'
        ) {
            return;
        }

        const translator = this;
        const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;

        Window_MenuCommand.prototype.addOriginalCommands = function () {
            const result = originalAddOriginalCommands.apply(this, arguments);

            try {
                if (!Array.isArray(this._list)) {
                    return result;
                }

                for (const entry of this._list) {
                    if (!entry || entry.symbol !== 'skillSetting') {
                        continue;
                    }

                    const translated = translator.translateIfSkillCpField(entry.name, [
                        MENU_TITLE_FIELD,
                    ]);

                    if (translated !== entry.name) {
                        entry.name = translated;
                    }
                }
            } catch (error) {
                console.warn(
                    '[SkillCPSystemTranslator] Failed to apply runtime menu command translation',
                    error
                );
            }

            return result;
        };
    }

    patchWindowInstanceDrawText(windowInstance, guardProp, fields, warningLabel) {
        if (!windowInstance || typeof windowInstance.drawText !== 'function') {
            return;
        }

        if (windowInstance[guardProp]) {
            return;
        }

        const translator = this;
        const originalDrawText = windowInstance.drawText;

        windowInstance.drawText = function (text, x, y, maxWidth, align) {
            try {
                const translated = translator.translateIfSkillCpField(text, fields);
                if (translated !== text) {
                    arguments[0] = translated;
                }
            } catch (error) {
                console.warn(
                    `[SkillCPSystemTranslator] Failed to apply ${warningLabel} text translation`,
                    error
                );
            }

            return originalDrawText.apply(this, arguments);
        };

        Object.defineProperty(windowInstance, guardProp, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    patchSkillEquipSceneRuntime() {
        if (
            !window.Scene_SkillEquip ||
            !Scene_SkillEquip.prototype ||
            typeof Scene_SkillEquip.prototype.createCPWindow !== 'function' ||
            typeof Scene_SkillEquip.prototype.createSlotWindow !== 'function'
        ) {
            return;
        }

        const translator = this;
        const originalCreateCPWindow = Scene_SkillEquip.prototype.createCPWindow;
        const originalCreateSlotWindow = Scene_SkillEquip.prototype.createSlotWindow;

        Scene_SkillEquip.prototype.createCPWindow = function () {
            const result = originalCreateCPWindow.apply(this, arguments);

            try {
                translator.patchWindowInstanceDrawText(
                    this._cpWindow,
                    '__CHEAT_SKILL_CP_INSTANCE_DRAW_TEXT_PATCHED__',
                    ['CP Name', 'Set Name'],
                    'CP window'
                );
            } catch (error) {
                console.warn(
                    '[SkillCPSystemTranslator] Failed to patch Scene_SkillEquip.createCPWindow',
                    error
                );
            }

            return result;
        };

        Scene_SkillEquip.prototype.createSlotWindow = function () {
            const result = originalCreateSlotWindow.apply(this, arguments);

            try {
                translator.patchWindowInstanceDrawText(
                    this._slotWindow,
                    '__CHEAT_SKILL_CP_SLOT_INSTANCE_DRAW_TEXT_PATCHED__',
                    ['No Equip Slot Name'],
                    'slot window'
                );
            } catch (error) {
                console.warn(
                    '[SkillCPSystemTranslator] Failed to patch Scene_SkillEquip.createSlotWindow',
                    error
                );
            }

            return result;
        };
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        this.patchMenuCommandRuntime();
        this.patchSkillEquipSceneRuntime();

        window[RUNTIME_HOOK_GUARD] = true;
    }

    async prepareTranslator() {
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
                console.warn('[SkillCPSystemTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry && pluginEntry.parameters) {
            this.appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.appendEntriesFromParameters(
                runtimeParameters,
                'runtimePluginManagerParameter',
                entries
            );
        }

        return entries;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!isUsableText(text)) {
                continue;
            }

            const field = String(entry?.source?.field || '');
            const cacheType = this.getCacheTypeByField(field);
            const cacheKey = panel.getCacheKey(text, cacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `skill_cp_system_${cacheType}_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel) {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(panel);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
