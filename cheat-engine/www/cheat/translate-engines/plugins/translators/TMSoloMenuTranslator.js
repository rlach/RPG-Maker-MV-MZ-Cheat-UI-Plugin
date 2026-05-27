import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * TMSoloMenu translator
 *
 * Plugin: TMSoloMenu.js
 * Supported versions:
 * - v0.1.3b (MV): Solo-travel main menu with plugin-parameter driven labels.
 *
 * Notes:
 * - Translatable plugin text is stored in plugin parameters (JSON struct `name` fields and EXP text templates).
 * - Runtime integration patches the created solo status window instance from Scene_Menu,
 *   so only TMSoloMenu-specific labels are translated without broad Window_Base hooks.
 */

const PLUGIN_NAME = 'TMSoloMenu';
const CACHE_TYPE = 'plugin_tm_solo_menu';
const SCENE_MENU_PATCH_FLAG = '__CHEAT_TM_SOLO_MENU_SCENE_MENU_PATCHED__';
const SOLO_STATUS_PATCH_FLAG = '__CHEAT_TM_SOLO_MENU_STATUS_WINDOW_PATCHED__';

const BATTLE_PARAMETER_STRUCT_KEYS = Object.freeze([
    'menuMhp',
    'menuMmp',
    'menuAtk',
    'menuDef',
    'menuMat',
    'menuMdf',
    'menuAgi',
    'menuLuc',
    'menuHit',
    'menuEva',
    'menuCri',
    'menuCev',
    'menuMev',
    'menuMrf',
    'menuCnt',
    'menuHrg',
    'menuMrg',
    'menuTrg',
    'menuTgr',
    'menuGrd',
    'menuRec',
    'menuPha',
    'menuMcr',
    'menuTcr',
    'menuPdr',
    'menuMdr',
    'menuFdr',
    'menuExr',
]);

const FREE_TEXT_STRUCT_KEYS = Object.freeze([
    'freeText1',
    'freeText2',
    'freeText3',
    'freeText4',
    'freeText5',
    'freeText6',
    'freeText7',
    'freeText8',
    'freeText9',
    'freeText10',
]);

const DIRECT_TEXT_PARAMETER_KEYS = Object.freeze(['expNextText', 'expMaxText']);

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

export class TMSoloMenuTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownTexts = null;
        this._expTemplateMatchers = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'TMSoloMenu';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    appendEntry(output, text, source) {
        if (!Array.isArray(output) || !this.isUsableText(text)) {
            return;
        }

        output.push({
            text: String(text),
            source,
        });
    }

    appendStructNameEntry(output, parameters, key, sourceScope) {
        const parsed = parseJsonSafely(parameters[key], null);
        if (!parsed || typeof parsed !== 'object') {
            return;
        }

        this.appendEntry(output, parsed.name, {
            scope: sourceScope,
            field: key,
            nestedField: 'name',
        });
    }

    appendEntriesFromParameters(output, parameters, scope) {
        if (!Array.isArray(output) || !parameters || typeof parameters !== 'object') {
            return;
        }

        for (const key of BATTLE_PARAMETER_STRUCT_KEYS) {
            this.appendStructNameEntry(output, parameters, key, scope);
        }

        for (const key of FREE_TEXT_STRUCT_KEYS) {
            this.appendStructNameEntry(output, parameters, key, scope);
        }

        for (const key of DIRECT_TEXT_PARAMETER_KEYS) {
            this.appendEntry(output, parameters[key], {
                scope,
                field: key,
            });
        }
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        if (pluginEntry?.parameters) {
            this.appendEntriesFromParameters(entries, pluginEntry.parameters, 'pluginEntryParameters');
        }

        const runtimeParameters = window.PluginManager?.parameters?.(this.getPluginName());
        if (runtimeParameters) {
            this.appendEntriesFromParameters(
                entries,
                runtimeParameters,
                'runtimePluginManagerParameters'
            );
        }

        return entries;
    }

    async precomputeCounts() {
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
                this._knownTexts = null;
                this._expTemplateMatchers = null;
            })
            .catch((error) => {
                console.warn('[TMSoloMenuTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    getKnownTexts() {
        if (this._knownTexts instanceof Set) {
            return this._knownTexts;
        }

        const entries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        const known = new Set();

        for (const entry of entries) {
            const text = entry?.text;
            if (this.isUsableText(text)) {
                known.add(String(text));
            }
        }

        this._knownTexts = known;
        return known;
    }

    getExpTemplateMatchers() {
        if (Array.isArray(this._expTemplateMatchers)) {
            return this._expTemplateMatchers;
        }

        const templates = [];
        const byTemplate = new Set();

        const entries = this._scanPrepared ? this._scanEntries : this.buildScanEntries();
        for (const entry of entries) {
            const field = String(entry?.source?.field || '');
            if (!DIRECT_TEXT_PARAMETER_KEYS.includes(field)) {
                continue;
            }

            const template = String(entry?.text || '');
            if (!this.isUsableText(template) || !template.includes('%1') || byTemplate.has(template)) {
                continue;
            }

            byTemplate.add(template);

            const pattern = `^${escapeRegExp(template).replaceAll('%1', '(.+?)')}$`;
            templates.push({
                template,
                regex: new RegExp(pattern),
            });
        }

        this._expTemplateMatchers = templates;
        return templates;
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
                id: `plugin_tm_solo_menu_${byCacheKey.size}`,
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

    resolveKnownRuntimeText(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceText = String(text);
        if (!this.getKnownTexts().has(sourceText)) {
            return sourceText;
        }

        return this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
            requireRuntimeTranslationActive: true,
            missValue: sourceText,
        });
    }

    resolveExpRuntimeText(renderedText, runtime) {
        if (!this.isUsableText(renderedText)) {
            return renderedText;
        }

        const sourceText = String(renderedText);

        if (this.getKnownTexts().has(sourceText)) {
            return this.resolveKnownRuntimeText(sourceText, runtime);
        }

        for (const matcher of this.getExpTemplateMatchers()) {
            const match = matcher.regex.exec(sourceText);
            if (!match) {
                continue;
            }

            const translatedTemplate = this.resolveRuntimeTranslation(
                matcher.template,
                runtime,
                this.getCacheType(),
                {
                    requireRuntimeTranslationActive: true,
                    missValue: matcher.template,
                }
            );

            if (!this.isUsableText(translatedTemplate) || translatedTemplate === matcher.template) {
                return sourceText;
            }

            if (typeof translatedTemplate.format === 'function') {
                return translatedTemplate.format(match[1]);
            }

            return translatedTemplate.replaceAll('%1', match[1]);
        }

        return sourceText;
    }

    patchSoloStatusWindowInstance(statusWindow) {
        if (
            !statusWindow ||
            statusWindow[SOLO_STATUS_PATCH_FLAG] ||
            typeof statusWindow.drawSoloParameter !== 'function' ||
            typeof statusWindow.drawBattleParameter !== 'function' ||
            typeof statusWindow.drawActorLevelAndExp !== 'function'
        ) {
            return;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveKnownRuntimeText = this.resolveKnownRuntimeText.bind(this);
        const resolveExpRuntimeText = this.resolveExpRuntimeText.bind(this);

        const originalDrawSoloParameter = statusWindow.drawSoloParameter;
        statusWindow.drawSoloParameter = function (actor, code, parameter) {
            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    code === 'TEXT' &&
                    parameter &&
                    typeof parameter === 'object' &&
                    typeof parameter.name === 'string'
                ) {
                    const translatedName = resolveKnownRuntimeText(parameter.name, runtime);
                    if (translatedName !== parameter.name) {
                        const nextParameter = {
                            ...parameter,
                            name: translatedName,
                        };
                        return originalDrawSoloParameter.call(this, actor, code, nextParameter);
                    }
                }
            } catch (error) {
                console.warn(
                    '[TMSoloMenuTranslator] Failed to apply runtime free-text translation',
                    error
                );
            }

            return originalDrawSoloParameter.apply(this, arguments);
        };

        const originalDrawBattleParameter = statusWindow.drawBattleParameter;
        statusWindow.drawBattleParameter = function (actor, paramId, parameter) {
            try {
                const runtime = getRuntime();
                if (
                    isRuntimeTranslationActive(runtime) &&
                    parameter &&
                    typeof parameter === 'object' &&
                    typeof parameter.name === 'string'
                ) {
                    const translatedName = resolveKnownRuntimeText(parameter.name, runtime);
                    if (translatedName !== parameter.name) {
                        const nextParameter = {
                            ...parameter,
                            name: translatedName,
                        };
                        return originalDrawBattleParameter.call(this, actor, paramId, nextParameter);
                    }
                }
            } catch (error) {
                console.warn(
                    '[TMSoloMenuTranslator] Failed to apply runtime battle-parameter translation',
                    error
                );
            }

            return originalDrawBattleParameter.apply(this, arguments);
        };

        const originalDrawActorLevelAndExp = statusWindow.drawActorLevelAndExp;
        statusWindow.drawActorLevelAndExp = function () {
            const runtime = getRuntime();
            if (!isRuntimeTranslationActive(runtime)) {
                return originalDrawActorLevelAndExp.apply(this, arguments);
            }

            const originalDrawText = this.drawText;
            this.drawText = function (text, x, y, width, align) {
                const translated = resolveExpRuntimeText(text, runtime);
                return originalDrawText.call(this, translated, x, y, width, align);
            };

            try {
                return originalDrawActorLevelAndExp.apply(this, arguments);
            } finally {
                this.drawText = originalDrawText;
            }
        };

        Object.defineProperty(statusWindow, SOLO_STATUS_PATCH_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    enablePluginTranslation() {
        const sceneMenuPrototype = window.Scene_Menu?.prototype;
        if (!sceneMenuPrototype || typeof sceneMenuPrototype.createStatusWindow !== 'function') {
            return false;
        }

        if (sceneMenuPrototype[SCENE_MENU_PATCH_FLAG]) {
            return true;
        }

        const patchSoloStatusWindowInstance = this.patchSoloStatusWindowInstance.bind(this);
        const originalCreateStatusWindow = sceneMenuPrototype.createStatusWindow;

        sceneMenuPrototype.createStatusWindow = function () {
            const result = originalCreateStatusWindow.apply(this, arguments);

            try {
                patchSoloStatusWindowInstance(this._statusWindow);
            } catch (error) {
                console.warn(
                    '[TMSoloMenuTranslator] Failed to patch solo status window instance',
                    error
                );
            }

            return result;
        };

        if (window.SceneManager?._scene instanceof window.Scene_Menu) {
            patchSoloStatusWindowInstance(window.SceneManager._scene._statusWindow);
        }

        Object.defineProperty(sceneMenuPrototype, SCENE_MENU_PATCH_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }
}
