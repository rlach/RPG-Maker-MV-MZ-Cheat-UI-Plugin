/* eslint-disable no-control-regex -- RPG Maker MZ uses ESC (\x1b) in control characters expanded from variables. */
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { TAG_BRACKET, TAG_STYLE, TAG_TYPE } from '../../ai-engine/constants.js';
import { parseJsonSafely, parseStructArraySafely } from './TranslatorHelpers.js';
import { applyTranslationsToCommands } from '../../../js/CommandTranslationManager.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

/**
 * HS / Human Simulate custom UI plugin family translator (RJ01617047)
 *
 * Supported plugins (MZ):
 * - HS_LangSimple v1.4.1 (+ HS_LangSimple_HideTitleLang, HS_LangForceDefault, HS_LangBridge)
 * - HS_RecallTitle v1.0.1
 * - HS_OptionHelp v1.0 (+ HS_OptionHelp_LangBridge v1.0)
 * - HS_FastMode v1.3 (+ HS_FastOptionLocalize v1.2)
 * - HS_SV_OptionLocalize v1.1
 * - HS_UtilityOptions_Localize v1.2.3
 * - HS_FullscreenOption v1.0
 * - HS_ReadSkipMZ v1.5 / v1.5.2
 * - HS_KeyGuide v1.0 / v1.0.1
 * - HS_TooltipCE v1.3
 * - HS_IconScaleMZ v1.1
 * - HS_BacklogCore_Simple v1.3.0 / v1.3.1
 * - MEG_PictureTooltipMZ v1.5 (+ HS_TooltipIconFix_LineReset)
 *
 * Translation notes:
 * - HS_LangSimple wraps $dataSystem.terms (commands, params, basic, messages) in getters/setters
 *   that expand \V[n] using $gameVariables.value(n) outside of title/load scenes. When GameArrays
 *   or SystemMessages snapshots and writes back terms during boot or in-game before variable initialization,
 *   uninitialized variables evaluate to numeric 0 and permanently overwrite the \V[n] template with "0".
 *   This translator restores canonical Japanese source strings for termsOriginal and resolves \V[n]
 *   safely at presentation time without allowing numeric 0 or translated strings to clobber templates.
 * - Translates HS_RecallTitle gallery scene list, locked placeholders, and title command.
 * - Translates HS_OptionHelp / HS_OptionHelp_LangBridge descriptions and preserves translated
 *   Window_Options labels after refresh() relabeling hooks.
 * - Extracts and translates MEG_PictureTooltipMZ (AddTooltip / AppendTooltip) and HS_TooltipCE
 *   (ShowText) tooltip strings, registers \IS, \IF, and \FS tags, and ensures escape tags inside
 *   expanded \V[n] variable values are converted to ESC (\x1b) for drawTextEx icon rendering.
 * - Translates HS_BacklogCore_Simple entries at presentation time without mutating save data.
 */

const PLUGIN_NAME = 'HS_LangSimple';
const CACHE_TYPE = 'plugin_hs_custom_ui';

const HS_PLUGIN_ALIASES = [
    'HS_LangSimple',
    'HS_RecallTitle',
    'HS_OptionHelp',
    'HS_OptionHelp_LangBridge',
    'HS_FastMode',
    'HS_FastOptionLocalize',
    'HS_SV_OptionLocalize',
    'HS_UtilityOptions_Localize',
    'HS_FullscreenOption',
    'HS_ReadSkipMZ',
    'HS_KeyGuide',
    'HS_TooltipCE',
    'HS_IconScaleMZ',
    'HS_BacklogCore_Simple',
    'MEG_PictureTooltipMZ',
    'HS_TooltipIconFix_LineReset',
];

const CUSTOM_TAGS = [
    {
        description: 'Font size escape tag used in tooltips, text pictures, and messages.',
        tagSymbol: 'FS',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        style: TAG_STYLE.ESCAPE,
        requiredConsistency: false,
    },
    {
        description: 'HS_IconScaleMZ scaled icon tag \\IS[iconId,size(,yOffset)].',
        tagSymbol: 'IS',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        style: TAG_STYLE.ESCAPE,
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'HS_IconScaleMZ font-sized icon tag \\IF[iconId].',
        tagSymbol: 'IF',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        style: TAG_STYLE.ESCAPE,
        requiredConsistency: true,
    },
];

export class HsCustomUiTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._metadataPrepared = false;
        this._titleFallbackByVarId = new Map();
        this._canonicalCommandByVariant = new Map();
        this._canonicalUiTextByVariant = new Map();
        this._optionHelpBySymbol = new Map();
        this._staticUiTexts = new Set();
        this._commandTexts = new Set();
        this._recallDrawDepth = 0;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'HS Custom UI (LangSimple, Recall, OptionHelp, PictureTooltip)';
    }

    getPluginAliases() {
        return HS_PLUGIN_ALIASES;
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getPluginParameters(pluginName) {
        const entry = this.findPluginEntry(pluginName);
        if (entry?.parameters && typeof entry.parameters === 'object') {
            return entry.parameters;
        }

        const managerParams = window.PluginManager?.parameters?.(pluginName);
        return managerParams && typeof managerParams === 'object' ? managerParams : null;
    }

    isUsableTooltipTemplate(value) {
        if (!this.isUsableText(value)) {
            return false;
        }

        const stripped = String(value)
            .replace(/(?:\\|\x1b)[A-Za-z]+\[[^\]]*\]/g, '')
            .replace(/(?:\\|\x1b)[{.!><^|}]/g, '')
            .replace(/[\d\s.,+\-/:：;；()（）[\]【】≤≥<>↑↓—\-_%％/]+/g, '')
            .trim();

        return stripped.length > 0;
    }

    registerCommandVariantGroup(variants) {
        const usable = variants.filter((text) => this.isUsableText(text));
        if (usable.length === 0) {
            return;
        }

        const canonical = usable[0];
        this._commandTexts.add(canonical);
        for (const variant of usable) {
            this._canonicalCommandByVariant.set(variant, canonical);
            this._canonicalCommandByVariant.set(variant.trim(), canonical);
        }
    }

    registerUiTextVariantGroup(variants) {
        const usable = variants.filter((text) => this.isUsableText(text));
        if (usable.length === 0) {
            return;
        }

        const canonical = usable[0];
        this._staticUiTexts.add(canonical);
        for (const variant of usable) {
            this._canonicalUiTextByVariant.set(variant, canonical);
        }
    }

    ensureMetadataPrepared() {
        if (this._metadataPrepared) {
            return;
        }

        this._metadataPrepared = true;

        // 1. HS_LangSimple titleFallbacks & commands
        const langSimpleParams = this.getPluginParameters('HS_LangSimple');
        if (langSimpleParams) {
            const titleCommandText = String(langSimpleParams.titleCommandText || '');
            if (this.isUsableText(titleCommandText)) {
                this.registerCommandVariantGroup([titleCommandText]);
            }

            for (const item of parseStructArraySafely(langSimpleParams.titleFallbacks)) {
                const varId = Number(item.varId || 0);
                if (varId <= 0) {
                    continue;
                }

                const entry = {
                    0: String(item.value0 ?? ''),
                    1: String(item.value1 ?? ''),
                    2: String(item.value2 ?? ''),
                    3: String(item.value3 ?? ''),
                    def: String(item.def ?? ''),
                };
                this._titleFallbackByVarId.set(varId, entry);

                const variants = [entry[0], entry[1], entry[2], entry[3], entry.def].filter((v) =>
                    this.isUsableText(v)
                );
                if (variants.length > 0) {
                    const canonical = variants[0];
                    for (const variant of variants) {
                        this._canonicalCommandByVariant.set(variant, canonical);
                        this._canonicalCommandByVariant.set(variant.trim(), canonical);
                        this._canonicalUiTextByVariant.set(variant, canonical);
                    }
                }
            }
        }

        // 2. HS_RecallTitle commands, locked text, and scene names
        const recallParams = this.getPluginParameters('HS_RecallTitle');
        if (recallParams) {
            this.registerCommandVariantGroup([
                String(recallParams.RecallCommandJP || '回想'),
                String(recallParams.RecallCommandEN || ''),
                String(recallParams.RecallCommandZH || ''),
                String(recallParams.RecallCommandKO || ''),
            ]);

            this.registerUiTextVariantGroup([
                String(recallParams.LockedTextJP || '？？？'),
                String(recallParams.LockedTextEN || ''),
                String(recallParams.LockedTextZH || ''),
                String(recallParams.LockedTextKO || ''),
            ]);

            for (const scene of parseStructArraySafely(recallParams.Scenes)) {
                this.registerUiTextVariantGroup([
                    String(scene.nameJP || ''),
                    String(scene.nameEN || ''),
                    String(scene.nameZH || ''),
                    String(scene.nameKO || ''),
                ]);
            }
        }

        // 3. HS_OptionHelp & HS_OptionHelp_LangBridge
        const optionHelpParams = this.getPluginParameters('HS_OptionHelp');
        const optionBridgeParams = this.getPluginParameters('HS_OptionHelp_LangBridge');
        if (optionHelpParams || optionBridgeParams) {
            const symbols = [
                ['fastMode', 'fastModeText', 'fastFb'],
                ['hsAuto', 'hsAutoText', 'autoFb'],
                ['hsProtect', 'hsProtectText', 'protFb'],
            ];

            for (const [symbol, helpKey, bridgePrefix] of symbols) {
                const variants = [];
                const bridge0 = String(optionBridgeParams?.[`${bridgePrefix}0`] || '');
                const baseText = String(optionHelpParams?.[helpKey] || '');
                if (this.isUsableText(bridge0)) {
                    variants.push(bridge0);
                }
                if (this.isUsableText(baseText) && !variants.includes(baseText)) {
                    variants.push(baseText);
                }
                for (let idx = 1; idx <= 3; idx++) {
                    const fb = String(optionBridgeParams?.[`${bridgePrefix}${idx}`] || '');
                    if (this.isUsableText(fb)) {
                        variants.push(fb);
                    }
                }

                if (variants.length > 0) {
                    this._optionHelpBySymbol.set(symbol, variants[0]);
                    this.registerUiTextVariantGroup(variants);
                }
            }
        }

        // 4. Option label localizers (HS_SV_OptionLocalize, HS_FastMode, HS_FastOptionLocalize, HS_UtilityOptions_Localize, HS_FullscreenOption, HS_ReadSkipMZ, HS_KeyGuide)
        const svParams = this.getPluginParameters('HS_SV_OptionLocalize');
        if (svParams) {
            this.registerCommandVariantGroup([
                String(svParams.fb0 || 'ボイス 音量'),
                String(svParams.fb1 || ''),
                String(svParams.fb2 || ''),
                String(svParams.fb3 || ''),
            ]);
        }

        const fastModeParams = this.getPluginParameters('HS_FastMode');
        const fastLocParams = this.getPluginParameters('HS_FastOptionLocalize');
        if (fastModeParams || fastLocParams) {
            this.registerCommandVariantGroup([
                String(fastLocParams?.fastFb0 || fastModeParams?.OptionName || '高速モード'),
                String(fastLocParams?.fastFb1 || ''),
                String(fastLocParams?.fastFb2 || ''),
                String(fastLocParams?.fastFb3 || ''),
            ]);
            this.registerCommandVariantGroup([
                String(fastLocParams?.autoFb0 || fastModeParams?.AutoOptionName || '自動送り'),
                String(fastLocParams?.autoFb1 || ''),
                String(fastLocParams?.autoFb2 || ''),
                String(fastLocParams?.autoFb3 || ''),
            ]);
            this.registerCommandVariantGroup([
                String(
                    fastLocParams?.protectFb0 ||
                        fastModeParams?.ProtectOptionName ||
                        '重要シーンを保護'
                ),
                String(fastLocParams?.protectFb1 || ''),
                String(fastLocParams?.protectFb2 || ''),
                String(fastLocParams?.protectFb3 || ''),
            ]);
        }

        const utilOptParams = this.getPluginParameters('HS_UtilityOptions_Localize');
        if (utilOptParams) {
            this.registerCommandVariantGroup([
                String(utilOptParams.saveFb0 || 'セーブ'),
                String(utilOptParams.saveFb1 || ''),
                String(utilOptParams.saveFb2 || ''),
                String(utilOptParams.saveFb3 || ''),
            ]);
            this.registerCommandVariantGroup([
                String(utilOptParams.loadFb0 || 'ロード'),
                String(utilOptParams.loadFb1 || ''),
                String(utilOptParams.loadFb2 || ''),
                String(utilOptParams.loadFb3 || ''),
            ]);
            this.registerCommandVariantGroup([
                String(utilOptParams.titleFb0 || 'タイトルへ'),
                String(utilOptParams.titleFb1 || ''),
                String(utilOptParams.titleFb2 || ''),
                String(utilOptParams.titleFb3 || ''),
            ]);
        }

        const fullscreenParams = this.getPluginParameters('HS_FullscreenOption');
        if (fullscreenParams) {
            const labels = parseStructArraySafely(fullscreenParams.labels)
                .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0))
                .map((item) => String(item.text || ''));
            this.registerCommandVariantGroup(labels);
        }

        const readSkipParams = this.getPluginParameters('HS_ReadSkipMZ');
        if (readSkipParams) {
            this.registerCommandVariantGroup([
                String(readSkipParams.OptionFb0 || '既読スキップ'),
                String(readSkipParams.OptionFb1 || ''),
                String(readSkipParams.OptionFb2 || ''),
                String(readSkipParams.OptionFb3 || ''),
            ]);
        }

        const keyGuideParams = this.getPluginParameters('HS_KeyGuide');
        if (keyGuideParams && this.findPluginEntry('HS_KeyGuide')?.status) {
            this.registerCommandVariantGroup([String(keyGuideParams.OptionName || '')]);
            for (const item of parseStructArraySafely(keyGuideParams.ActionLabels)) {
                this.registerUiTextVariantGroup([
                    String(item.labelJp || ''),
                    String(item.labelEn || ''),
                    String(item.labelZh || ''),
                    String(item.labelKo || ''),
                ]);
            }
        }
    }

    getCanonicalCommandText(text) {
        if (!this.isUsableText(text)) {
            return text;
        }

        this.ensureMetadataPrepared();
        const direct = this._canonicalCommandByVariant.get(text);
        if (direct) {
            return direct;
        }

        const trimmed = text.trim();
        const trimmedMatch = this._canonicalCommandByVariant.get(trimmed);
        if (trimmedMatch) {
            const trailingSpace = text.endsWith(' ') && !trimmedMatch.endsWith(' ') ? ' ' : '';
            return trimmedMatch + trailingSpace;
        }

        return text;
    }

    getCanonicalUiText(text) {
        if (!this.isUsableText(text)) {
            return text;
        }

        this.ensureMetadataPrepared();
        return this._canonicalUiTextByVariant.get(text) || text;
    }

    resolveTitleFallbackVarText(varId, useNativeLanguage = false) {
        this.ensureMetadataPrepared();
        const fb = this._titleFallbackByVarId.get(Number(varId));
        if (!fb) {
            return '';
        }

        if (!useNativeLanguage) {
            return fb[0] || fb.def || fb[1] || '';
        }

        const langIdx = Number(window.ConfigManager?.hs_langIndex ?? 0);
        const rawVarValue = this.getRawVariableString(varId);
        if (this.isUsableText(rawVarValue)) {
            return rawVarValue;
        }

        return fb[langIdx] || fb[0] || fb.def || '';
    }

    getRawVariableString(varId) {
        const gameVars = window.$gameVariables;
        if (!gameVars) {
            return '';
        }

        const raw =
            typeof gameVars._translateOriginalValue === 'function'
                ? gameVars._translateOriginalValue(varId)
                : Array.isArray(gameVars._data)
                  ? gameVars._data[varId]
                  : gameVars.value?.(varId);

        return typeof raw === 'string' && raw.trim() !== '' ? raw : '';
    }

    expandTermTemplate(template, useNativeLanguage = false) {
        if (typeof template !== 'string' || !template) {
            return '';
        }

        return template
            .replace(/\\V\[(\d+)\]/gi, (_, idStr) => {
                const varId = Number(idStr);
                if (!useNativeLanguage) {
                    const canonicalFb = this.resolveTitleFallbackVarText(varId, false);
                    if (this.isUsableText(canonicalFb)) {
                        return canonicalFb;
                    }
                    const rawStr = this.getRawVariableString(varId);
                    return this.getCanonicalUiText(rawStr);
                }

                return this.resolveTitleFallbackVarText(varId, true);
            })
            .replace(/\\\\/g, '\\');
    }

    inferSystemTermTemplates() {
        this.ensureMetadataPrepared();
        const commandTemplates = new Map([
            [9, '\\V[173]'],
            [10, '\\V[174]'],
            [11, '\\V[172] '],
            [18, '\\V[175]'],
            [19, '\\V[176]'],
            [21, '\\V[177]'],
            [22, '\\V[178]'],
        ]);
        const messageTemplates = new Map([
            ['saveMessage', '\\V[161] '],
            ['loadMessage', '\\V[162] '],
            ['file', '\\V[163] '],
            ['autosave', '\\V[164] '],
            ['alwaysDash', '\\V[165] '],
            ['commandRemember', '\\V[166] '],
            ['touchUI', '\\V[167] '],
            ['bgmVolume', '\\V[168] '],
            ['bgsVolume', '\\V[169] '],
            ['meVolume', '\\V[170] '],
            ['seVolume', '\\V[171] '],
        ]);
        return { commandTemplates, messageTemplates };
    }

    isCorruptedOrVariableTermValue(value, expectedCanonical) {
        if (typeof value !== 'string') {
            return false;
        }

        const trimmed = value.trim();
        if (trimmed === '' || trimmed === '0' || /\\V\[\d+\]/i.test(value)) {
            return true;
        }

        if (expectedCanonical && this.getCanonicalCommandText(value) === expectedCanonical) {
            return true;
        }

        return false;
    }

    repairAndWrapSystemTerms() {
        const terms = window.$dataSystem?.terms;
        if (!terms || typeof terms !== 'object') {
            return false;
        }

        this.ensureMetadataPrepared();
        if (this._titleFallbackByVarId.size === 0) {
            return true;
        }

        const { commandTemplates, messageTemplates } = this.inferSystemTermTemplates();
        const translator = this;

        if (Array.isArray(terms.commands)) {
            if (!Array.isArray(terms.commandsOriginal)) {
                terms.commandsOriginal = terms.commands.slice();
            }

            for (const [index, template] of commandTemplates.entries()) {
                if (index >= terms.commands.length) {
                    continue;
                }

                const canonical = this.expandTermTemplate(template, false);
                if (!this.isUsableText(canonical)) {
                    continue;
                }

                const currentVal = terms.commands[index];
                const origVal = terms.commandsOriginal[index];
                if (
                    this.isCorruptedOrVariableTermValue(currentVal, canonical) ||
                    this.isCorruptedOrVariableTermValue(origVal, canonical)
                ) {
                    terms.commandsOriginal[index] = canonical;
                    this.wrapSystemTermSlot(terms.commands, index, template, [
                        'command',
                        CACHE_TYPE,
                    ]);
                }
            }
        }

        if (terms.messages && typeof terms.messages === 'object') {
            if (!terms.messagesOriginal || typeof terms.messagesOriginal !== 'object') {
                terms.messagesOriginal = { ...terms.messages };
            }

            for (const [key, template] of messageTemplates.entries()) {
                if (!Object.prototype.hasOwnProperty.call(terms.messages, key)) {
                    continue;
                }

                const canonical = this.expandTermTemplate(template, false);
                if (!this.isUsableText(canonical)) {
                    continue;
                }

                const currentVal = terms.messages[key];
                const origVal = terms.messagesOriginal[key];
                const cacheTypes = [
                    'alwaysDash',
                    'commandRemember',
                    'touchUI',
                    'bgmVolume',
                    'bgsVolume',
                    'meVolume',
                    'seVolume',
                ].includes(key)
                    ? ['command', 'system_message', CACHE_TYPE]
                    : ['system_message', 'command', CACHE_TYPE];

                if (
                    this.isCorruptedOrVariableTermValue(currentVal, canonical) ||
                    this.isCorruptedOrVariableTermValue(origVal, canonical)
                ) {
                    terms.messagesOriginal[key] = canonical;
                    translator.wrapSystemTermSlot(terms.messages, key, template, cacheTypes);
                }
            }
        }

        return true;
    }

    wrapSystemTermSlot(container, key, initialTemplate, cacheTypes) {
        let template = initialTemplate;
        const translator = this;
        const canonical = translator.expandTermTemplate(template, false);

        Object.defineProperty(container, key, {
            configurable: true,
            enumerable: true,
            get() {
                const runtime = translator.getRuntime();
                const sourceText = translator.expandTermTemplate(template, false);
                if (!translator.isRuntimeTranslationActive(runtime)) {
                    return translator.expandTermTemplate(template, true);
                }

                const trimmedSource = sourceText.trim();
                const candidates =
                    trimmedSource && trimmedSource !== sourceText
                        ? [sourceText, trimmedSource]
                        : [sourceText];

                for (const candidate of candidates) {
                    const translated = translator.resolveRuntimeTranslation(
                        candidate,
                        runtime,
                        cacheTypes,
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: null,
                            harvestMissing: candidate === sourceText,
                        }
                    );
                    if (translator.isUsableText(translated) && translated.trim() !== '0') {
                        return translated;
                    }
                }

                return sourceText;
            },
            set(newValue) {
                if (typeof newValue === 'string' && /\\V\[\d+\]/i.test(newValue)) {
                    template = newValue;
                }
                // Ignore static overwrites (such as "0" or cached strings from GameArrays/SystemMessages)
                // so the dynamic getter remains authoritative.
            },
        });

        // Ensure canonical text is registered for command lookup
        if (this.isUsableText(canonical)) {
            this._canonicalCommandByVariant.set(canonical, canonical);
            this._canonicalCommandByVariant.set(canonical.trim(), canonical);
        }
    }

    resolveTooltipLine(line, runtime) {
        if (!this.isUsableText(line) || !this.isRuntimeTranslationActive(runtime)) {
            return line;
        }

        const canonical = this.getCanonicalUiText(line);
        return this.resolveRuntimeTranslation(
            canonical,
            runtime,
            [CACHE_TYPE, 'variable_value', 'message'],
            {
                requireRuntimeTranslationActive: true,
                missValue: line,
                harvestMissing: this.isUsableTooltipTemplate(canonical),
            }
        );
    }

    resolveMultilineTooltipText(text, runtime) {
        if (!this.isUsableText(text) || !this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        const canonicalFull = this.getCanonicalUiText(text);
        if (this.isUsableTooltipTemplate(canonicalFull)) {
            const fullTranslated = this.resolveRuntimeTranslation(
                canonicalFull,
                runtime,
                [CACHE_TYPE, 'variable_value', 'message'],
                {
                    requireRuntimeTranslationActive: true,
                    missValue: null,
                    harvestMissing: false,
                }
            );
            if (this.isUsableText(fullTranslated)) {
                return fullTranslated;
            }
        }

        const lines = String(text).split(/\r?\n/);
        if (lines.length <= 1) {
            return this.resolveTooltipLine(text, runtime);
        }

        return lines.map((line) => this.resolveTooltipLine(line, runtime)).join('\n');
    }

    enablePluginTranslation() {
        const windowBaseProto = window.Window_Base?.prototype;
        if (
            !windowBaseProto ||
            typeof windowBaseProto.drawText !== 'function' ||
            typeof windowBaseProto.drawTextEx !== 'function' ||
            typeof windowBaseProto.convertEscapeCharacters !== 'function'
        ) {
            return false;
        }

        this.registerPluginCustomTags(CUSTOM_TAGS);
        this.ensureMetadataPrepared();
        this.repairAndWrapSystemTerms();

        const translator = this;
        const runtime = this.getRuntime();

        // 1. Canonical command normalization on runtime
        if (
            runtime &&
            typeof runtime.getCanonicalSystemCommandName === 'function' &&
            !runtime.__cheatHsCanonicalCommandPatched
        ) {
            const originalGetCanonical = runtime.getCanonicalSystemCommandName;
            runtime.getCanonicalSystemCommandName = function (commandName) {
                const normalized = translator.isRuntimeTranslationActive(this)
                    ? translator.getCanonicalCommandText(commandName)
                    : commandName;
                return originalGetCanonical.call(this, normalized);
            };
            Object.defineProperty(runtime, '__cheatHsCanonicalCommandPatched', {
                value: true,
                configurable: true,
                enumerable: false,
                writable: false,
            });
        }

        // 2. Hook DataManager.onLoad and DataManager.createGameObjects so $dataSystem.terms
        // is always repaired immediately after loading or game object creation.
        if (window.DataManager && typeof window.DataManager.onLoad === 'function') {
            const originalOnLoad = window.DataManager.onLoad;
            window.DataManager.onLoad = function (object) {
                const result = originalOnLoad.apply(this, arguments);
                if (object === window.$dataSystem) {
                    translator.repairAndWrapSystemTerms();
                }
                return result;
            };
        }

        if (window.DataManager && typeof window.DataManager.createGameObjects === 'function') {
            const originalCreateGameObjects = window.DataManager.createGameObjects;
            window.DataManager.createGameObjects = function () {
                const result = originalCreateGameObjects.apply(this, arguments);
                translator.repairAndWrapSystemTerms();
                return result;
            };
        }

        // 3. Hook TextManager.command and TextManager.message to never return "0"
        if (window.TextManager) {
            if (typeof window.TextManager.command === 'function') {
                const originalTmCommand = window.TextManager.command;
                window.TextManager.command = function (commandId) {
                    translator.repairAndWrapSystemTerms();
                    const value = window.$dataSystem?.terms?.commands?.[commandId];
                    if (typeof value === 'string' && value.trim() !== '' && value.trim() !== '0') {
                        return value;
                    }
                    return originalTmCommand.apply(this, arguments);
                };
            }

            if (typeof window.TextManager.message === 'function') {
                const originalTmMessage = window.TextManager.message;
                window.TextManager.message = function (messageId) {
                    translator.repairAndWrapSystemTerms();
                    const value = window.$dataSystem?.terms?.messages?.[messageId];
                    if (typeof value === 'string' && value.trim() !== '' && value.trim() !== '0') {
                        return value;
                    }
                    return originalTmMessage.apply(this, arguments);
                };
            }
        }

        // 4. Hook Window_Options.prototype.refresh to re-apply command translations after
        // HS_SV_OptionLocalize, HS_FastOptionLocalize, HS_UtilityOptions_Localize, and HS_ReadSkipMZ relabel()
        const optionsProto = window.Window_Options?.prototype;
        if (optionsProto && typeof optionsProto.refresh === 'function') {
            const originalOptionsRefresh = optionsProto.refresh;
            optionsProto.refresh = function () {
                const activeRuntime = translator.getRuntime();
                if (
                    translator.isRuntimeTranslationActive(activeRuntime) &&
                    Array.isArray(this._list)
                ) {
                    for (const item of this._list) {
                        if (item && typeof item.name === 'string') {
                            item.name = translator.getCanonicalCommandText(item.name);
                        }
                    }
                    applyTranslationsToCommands(this._list, activeRuntime);
                }
                const result = originalOptionsRefresh.apply(this, arguments);
                if (
                    translator.isRuntimeTranslationActive(activeRuntime) &&
                    Array.isArray(this._list)
                ) {
                    for (const item of this._list) {
                        if (item && typeof item.name === 'string') {
                            item.name = translator.getCanonicalCommandText(item.name);
                        }
                    }
                    applyTranslationsToCommands(this._list, activeRuntime);
                }
                return result;
            };
        }

        // 5. Hook Scene_Options.prototype.updateHsOptionHelp for HS_OptionHelp & HS_OptionHelp_LangBridge
        const sceneOptionsProto = window.Scene_Options?.prototype;
        if (sceneOptionsProto && typeof sceneOptionsProto.updateHsOptionHelp === 'function') {
            const originalUpdateHsOptionHelp = sceneOptionsProto.updateHsOptionHelp;
            sceneOptionsProto.updateHsOptionHelp = function () {
                const result = originalUpdateHsOptionHelp.apply(this, arguments);
                const activeRuntime = translator.getRuntime();
                if (
                    !translator.isRuntimeTranslationActive(activeRuntime) ||
                    !this._hsOptionHelpWindow
                ) {
                    return result;
                }

                const symbol =
                    typeof this._optionsWindow?.commandSymbol === 'function'
                        ? this._optionsWindow.commandSymbol(this._optionsWindow.index())
                        : '';
                const currentText = String(this._hsOptionHelpWindow._text || '');
                const canonicalText =
                    translator.getCanonicalUiText(currentText) ||
                    translator._optionHelpBySymbol.get(symbol) ||
                    currentText;

                if (!translator.isUsableText(canonicalText)) {
                    return result;
                }

                const translated = translator.resolveRuntimeTranslation(
                    canonicalText,
                    activeRuntime,
                    [CACHE_TYPE, 'variable_value'],
                    {
                        requireRuntimeTranslationActive: true,
                        missValue: currentText,
                    }
                );

                if (translator.isUsableText(translated)) {
                    this._hsOptionHelpWindow.setText(translated);
                }

                return result;
            };
        }

        // 6. Hook Window_Base.prototype.convertEscapeCharacters:
        // - For Window_HoverTooltip, Window_HSTooltip, and Window_OptionHelp: resolve tooltip/help line template before variable expansion.
        // - Convert any backslash escape codes (e.g. \IS[12,18], \IF[12], \FS[14], \I[12], \C[2]) that came from
        //   expanded \V[n] variables into ESC (\x1b) so Window_Base.prototype.processEscapeCharacter renders icons/colors properly.
        const originalConvertEscapeCharacters = windowBaseProto.convertEscapeCharacters;
        windowBaseProto.convertEscapeCharacters = function (text) {
            let inputText = text;
            const activeRuntime = translator.getRuntime();
            const isActive = translator.isRuntimeTranslationActive(activeRuntime);

            if (isActive && typeof inputText === 'string' && inputText.trim() !== '') {
                const ctorName = this?.constructor?.name || '';
                if (
                    ctorName === 'Window_HoverTooltip' ||
                    ctorName === 'Window_HSTooltip' ||
                    ctorName === 'Window_OptionHelp'
                ) {
                    inputText = translator.resolveMultilineTooltipText(inputText, activeRuntime);
                }
            }

            const converted = originalConvertEscapeCharacters.call(this, inputText);
            if (!isActive || typeof converted !== 'string') {
                return converted;
            }

            // When \V[n] expands inside originalConvertEscapeCharacters, RPG Maker's initial
            // text.replace(/\\/g, '\x1b') has already executed. Any backslash escape tags inside
            // a translated variable_value (e.g. "\IS[12,18]Affection") must be converted to \x1b.
            if (converted.includes('\\')) {
                return converted.replace(
                    /\\(IS|IF|FS|I|C|N|P|G|V)(\[[^\]]*\])?/gi,
                    (_, code, bracketPart) => `\x1b${code}${bracketPart || ''}`
                );
            }

            return converted;
        };

        // 7. Hook Window_Base.prototype.drawText for Window_HSRecallList and Window_KeyGuideList
        const originalDrawText = windowBaseProto.drawText;
        windowBaseProto.drawText = function (text, x, y, maxWidth, align) {
            let drawValue = text;
            const activeRuntime = translator.getRuntime();
            if (
                translator._recallDrawDepth === 0 &&
                translator.isRuntimeTranslationActive(activeRuntime) &&
                translator.isUsableText(drawValue)
            ) {
                const ctorName = this?.constructor?.name || '';
                if (ctorName === 'Window_HSRecallList' || ctorName === 'Window_KeyGuideList') {
                    const canonical = translator.getCanonicalUiText(drawValue);
                    drawValue = translator.resolveRuntimeTranslation(
                        canonical,
                        activeRuntime,
                        [CACHE_TYPE, 'command'],
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: drawValue,
                        }
                    );
                }
            }

            translator._recallDrawDepth++;
            try {
                return originalDrawText.call(this, drawValue, x, y, maxWidth, align);
            } finally {
                translator._recallDrawDepth--;
            }
        };

        // 8. Hook HS_BacklogCore_Simple: ensure backlog records canonical source text and
        // translates speaker + text at presentation time in Window_HS_BacklogList.
        const gameSystemProto = window.Game_System?.prototype;
        if (gameSystemProto && typeof gameSystemProto.hsPushBacklog === 'function') {
            const originalHsPushBacklog = gameSystemProto.hsPushBacklog;
            gameSystemProto.hsPushBacklog = function (entry) {
                if (entry && typeof entry === 'object') {
                    const gameMessage = window.$gameMessage;
                    if (
                        gameMessage &&
                        typeof gameMessage._translateOriginalSpeaker === 'string' &&
                        gameMessage._translateOriginalSpeaker.trim() !== ''
                    ) {
                        entry.speaker = gameMessage._translateOriginalSpeaker;
                    }
                }
                return originalHsPushBacklog.apply(this, arguments);
            };
        }

        const windowSelectableProto = window.Window_Selectable?.prototype;
        if (windowSelectableProto && typeof windowSelectableProto.drawAllItems === 'function') {
            const originalDrawAllItems = windowSelectableProto.drawAllItems;
            windowSelectableProto.drawAllItems = function () {
                const ctorName = this?.constructor?.name || '';
                const activeRuntime = translator.getRuntime();
                if (
                    ctorName !== 'Window_HS_BacklogList' ||
                    !translator.isRuntimeTranslationActive(activeRuntime) ||
                    !Array.isArray(this._data)
                ) {
                    return originalDrawAllItems.apply(this, arguments);
                }

                const mutations = [];
                try {
                    for (const item of this._data) {
                        if (!item || typeof item !== 'object') {
                            continue;
                        }

                        const originalSpeaker = item.speaker;
                        const originalText = item.text;
                        let nextSpeaker = originalSpeaker;
                        let nextText = originalText;

                        if (translator.isUsableText(originalSpeaker)) {
                            nextSpeaker = translator.resolveRuntimeTranslation(
                                originalSpeaker,
                                activeRuntime,
                                ['actor_name', CACHE_TYPE],
                                {
                                    requireRuntimeTranslationActive: true,
                                    missValue: originalSpeaker,
                                    harvestMissing: false,
                                }
                            );
                        }

                        if (translator.isUsableText(originalText)) {
                            nextText = translator.resolveRuntimeMessageTranslation(
                                originalText,
                                activeRuntime,
                                {
                                    hasPortrait: !!item.faceName,
                                    fallbackCacheTypes: ['message', 'message_portrait', CACHE_TYPE],
                                }
                            );
                        }

                        if (nextSpeaker !== originalSpeaker || nextText !== originalText) {
                            mutations.push({ item, originalSpeaker, originalText });
                            item.speaker = nextSpeaker;
                            item.text = nextText;
                        }
                    }

                    return originalDrawAllItems.apply(this, arguments);
                } finally {
                    for (let i = mutations.length - 1; i >= 0; i--) {
                        const { item, originalSpeaker, originalText } = mutations[i];
                        item.speaker = originalSpeaker;
                        item.text = originalText;
                    }
                }
            };
        }

        return true;
    }

    async precomputeCounts() {
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
                console.warn('[HsCustomUiTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        this.ensureMetadataPrepared();
        this.repairAndWrapSystemTerms();

        const entries = [];
        for (const text of this._staticUiTexts) {
            if (this.isUsableText(text)) {
                entries.push({ text, cacheType: CACHE_TYPE });
            }
        }

        for (const text of this._commandTexts) {
            if (this.isUsableText(text)) {
                entries.push({ text, cacheType: 'command' });
            }
        }

        if (Array.isArray(window.$dataCommonEvents)) {
            for (const commonEvent of window.$dataCommonEvents) {
                if (commonEvent && Array.isArray(commonEvent.list)) {
                    this.collectTooltipCommandsFromList(commonEvent.list, entries);
                }
            }
        }

        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id || 0);
            if (mapId <= 0) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                for (const event of mapData?.events || []) {
                    for (const page of event?.pages || []) {
                        if (Array.isArray(page?.list)) {
                            this.collectTooltipCommandsFromList(page.list, entries);
                        }
                    }
                }
            } catch (error) {
                console.warn(`[HsCustomUiTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectTooltipCommandsFromList(list, output) {
        let activeLanguageBranch = null;

        for (let i = 0; i < list.length; i++) {
            const cmd = list[i];
            if (!cmd) {
                continue;
            }

            // Track language conditional branches on variable 9 (0: JP, 1: EN, 2: ZH, 3: KO)
            // so non-source language branches in event commands are not harvested as source keys.
            if (
                cmd.code === 111 &&
                Array.isArray(cmd.parameters) &&
                cmd.parameters[0] === 1 &&
                cmd.parameters[1] === 9 &&
                cmd.parameters[2] === 0
            ) {
                activeLanguageBranch = {
                    indent: cmd.indent,
                    langIndex: Number(cmd.parameters[3]),
                };
                continue;
            }

            if (
                activeLanguageBranch &&
                (cmd.code === 411 || cmd.code === 412) &&
                cmd.indent === activeLanguageBranch.indent
            ) {
                activeLanguageBranch = null;
                continue;
            }

            if (activeLanguageBranch && activeLanguageBranch.langIndex !== 0) {
                continue;
            }

            if (Number(cmd.code) !== 357 || !Array.isArray(cmd.parameters)) {
                continue;
            }

            const pluginName = String(cmd.parameters[0] || '').trim();
            const commandName = String(cmd.parameters[1] || '').trim();
            const args = parseJsonSafely(cmd.parameters[3], null);
            if (!args || typeof args !== 'object') {
                continue;
            }

            if (
                (pluginName === 'MEG_PictureTooltipMZ' &&
                    (commandName === 'AddTooltip' || commandName === 'AppendTooltip')) ||
                (pluginName === 'HS_TooltipCE' && commandName === 'ShowText') ||
                (pluginName === 'HS_OptionHelp' && commandName === 'SetHelpText')
            ) {
                const rawText = typeof args.text === 'string' ? args.text : '';
                if (!this.isUsableTooltipTemplate(rawText)) {
                    continue;
                }

                output.push({
                    text: rawText,
                    cacheType: CACHE_TYPE,
                });
            }
        }
    }

    buildUniqueItems(runtime) {
        if (this._scanEntries.length === 0) {
            this.ensureMetadataPrepared();
            for (const text of this._staticUiTexts) {
                this._scanEntries.push({ text, cacheType: CACHE_TYPE });
            }
            for (const text of this._commandTexts) {
                this._scanEntries.push({ text, cacheType: 'command' });
            }
        }

        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            const cacheType = entry?.cacheType || CACHE_TYPE;
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, cacheType);
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: cacheType,
                id: `${cacheType}_${byCacheKey.size}`,
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

        return this.buildUniqueItems(runtime).filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        );
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniqueItems(runtime);
        const total = items.length;
        const left = items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey)).length;
        return {
            total,
            left,
            totalStrings: total,
            leftStrings: left,
        };
    }
}
