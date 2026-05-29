// @ts-nocheck
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * NRP_LearnSkillList translator
 *
 * Supported plugin versions:
 * - NRP_LearnSkillList.js v1.05 (MV/MZ)
 *
 * Translation notes:
 * - Text comes from plugin parameters and nested SkillSetList / SkillList
 *   structures.
 * - Runtime hooks patch the menu command label, confirmation buttons, and the
 *   visible labels drawn by the learn-skill windows.
 */

const PLUGIN_NAME = 'NRP_LearnSkillList';
const CACHE_TYPE = 'plugin_nrp_learn_skill_list';
const PARAM_SKILL_SET_LIST = 'SkillSetList';
const PARAM_SKILL_POINT_NAME = 'SkillPointName';
const PARAM_SKILL_POINT_MESSAGE = 'SkillPointMessage';
const PARAM_LEARNED_TEXT = 'LearnedText';
const PARAM_HIDDEN_SYMBOL = 'HiddenSymbol';
const PARAM_HIDDEN_SKILL_MASK = 'HiddenSkillMask';
const PARAM_CONFIRM_MESSAGE = 'ConfirmMessage';
const PARAM_CONFIRM_BUTTON_OK = 'ConfirmButtonOk';
const PARAM_CONFIRM_BUTTON_CANCEL = 'ConfirmButtonCancel';
const PARAM_COMMAND_NAME = 'CommandName';
const HOOK_FLAG = '__CHEAT_NRP_LEARN_SKILL_LIST_PATCHED__';
const FALLBACK_HOOK_FLAG = '__CHEAT_NRP_LEARN_SKILL_LIST_FALLBACK_PATCHED__';
const HELP_WINDOW_HOOK_FLAG = '__CHEAT_NRP_LEARN_SKILL_LIST_HELP_WINDOW_PATCHED__';

const TEXT_FIELDS = new Set(['DisplayName', 'HelpPostscript', 'Note']);

export class NrpLearnSkillListTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginAliases() {
        return ['NRP_LearnSkillList', 'NRP_SkillList', 'NRP_LearnSkills'];
    }

    getPluginLabel() {
        return 'NRP LearnSkillList';
    }

    getCacheType() {
        return CACHE_TYPE;
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
            })
            .catch((error) => {
                console.warn('[NRP_LearnSkillListTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        for (const source of this._resolveParameterSources()) {
            this._appendTopLevelEntries(entries, source);
            this._appendNestedSkillEntries(entries, source);
        }

        return entries;
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
        if (!menuProto || typeof menuProto.addOriginalCommands !== 'function') {
            return false;
        }

        if (menuProto[HOOK_FLAG]) {
            return true;
        }

        const originalAddOriginalCommands = menuProto.addOriginalCommands;
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveParameterText = this._resolveParameterText.bind(this);
        const translateRuntimeText = this._translateRuntimeText.bind(this);

        menuProto.addOriginalCommands = function () {
            const result = originalAddOriginalCommands.apply(this, arguments);
            const originalText = resolveParameterText(PARAM_COMMAND_NAME);
            if (!isUsableText(originalText) || !Array.isArray(this._list)) {
                return result;
            }

            try {
                const runtime = getRuntime();
                if (!runtime) {
                    return result;
                }

                const translated = translateRuntimeText(runtime, originalText);

                if (isUsableText(translated)) {
                    for (const entry of this._list) {
                        if (entry?.name === originalText) {
                            entry.name = translated;
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    '[NRP_LearnSkillListTranslator] Failed to translate menu command',
                    error
                );
            }

            return result;
        };

        const actorProto = window.Window_LearnSkillActor?.prototype;
        if (actorProto && typeof actorProto.drawSkillPoint === 'function') {
            const originalDrawSkillPoint = actorProto.drawSkillPoint;

            actorProto.drawSkillPoint = function () {
                const runtime = getRuntime();
                const originalText = resolveParameterText(PARAM_SKILL_POINT_NAME);
                if (!runtime || !isUsableText(originalText)) {
                    return originalDrawSkillPoint.apply(this, arguments);
                }

                const originalDrawText = this.drawText;
                this.drawText = function (text, x, y, maxWidth, align) {
                    let nextText = text;
                    if (typeof text === 'string' && text === originalText) {
                        const translated = translateRuntimeText(runtime, text);
                        if (isUsableText(translated)) {
                            nextText = translated;
                        }
                    }

                    return originalDrawText.call(this, nextText, x, y, maxWidth, align);
                };

                try {
                    return originalDrawSkillPoint.apply(this, arguments);
                } finally {
                    this.drawText = originalDrawText;
                }
            };
        }

        const listProto = window.Window_LearnSkillList?.prototype;
        if (listProto && typeof listProto.drawSkillCost === 'function') {
            const originalDrawSkillCost = listProto.drawSkillCost;

            listProto.drawSkillCost = function () {
                const runtime = getRuntime();
                const originalLearnedText = resolveParameterText(PARAM_LEARNED_TEXT);
                const originalMaskText = resolveParameterText(PARAM_HIDDEN_SKILL_MASK);
                const originalSymbolText = resolveParameterText(PARAM_HIDDEN_SYMBOL);
                if (!runtime) {
                    return originalDrawSkillCost.apply(this, arguments);
                }

                const originalDrawText = this.drawText;
                this.drawText = function (text, drawX, drawY, drawWidth, align) {
                    let nextText = text;
                    if (typeof text === 'string') {
                        const matches = [
                            originalLearnedText,
                            originalMaskText,
                            originalSymbolText,
                        ].filter((value) => isUsableText(value) && text === value);
                        if (matches.length > 0) {
                            const translated = translateRuntimeText(runtime, text);
                            if (isUsableText(translated)) {
                                nextText = translated;
                            }
                        }
                    }

                    return originalDrawText.call(this, nextText, drawX, drawY, drawWidth, align);
                };

                try {
                    return originalDrawSkillCost.apply(this, arguments);
                } finally {
                    this.drawText = originalDrawText;
                }
            };
        }

        if (listProto && typeof listProto.drawItemName === 'function') {
            const originalDrawItemName = listProto.drawItemName;

            listProto.drawItemName = function (learnSkillData, x, y, width) {
                const runtime = getRuntime();
                if (!runtime) {
                    return originalDrawItemName.call(this, learnSkillData, x, y, width);
                }

                const originalMaskText = resolveParameterText(PARAM_HIDDEN_SKILL_MASK);
                const originalSymbolText = resolveParameterText(PARAM_HIDDEN_SYMBOL);
                let nextLearnSkillData = learnSkillData;
                if (
                    learnSkillData &&
                    typeof learnSkillData === 'object' &&
                    isUsableText(learnSkillData.DisplayName)
                ) {
                    const sourceDisplayName = String(learnSkillData.DisplayName);
                    const translatedDisplayName = translateRuntimeText(runtime, sourceDisplayName);
                    if (
                        isUsableText(translatedDisplayName) &&
                        translatedDisplayName !== sourceDisplayName
                    ) {
                        nextLearnSkillData = {
                            ...learnSkillData,
                            DisplayName: translatedDisplayName,
                        };
                    }
                }

                const originalDrawText = this.drawText;
                this.drawText = function (text, drawX, drawY, drawWidth, align) {
                    let nextText = text;
                    if (
                        typeof text === 'string' &&
                        ((isUsableText(originalMaskText) && text === originalMaskText) ||
                            (isUsableText(originalSymbolText) && text === originalSymbolText))
                    ) {
                        nextText = translateRuntimeText(runtime, text);
                    }

                    return originalDrawText.call(this, nextText, drawX, drawY, drawWidth, align);
                };

                try {
                    return originalDrawItemName.call(this, nextLearnSkillData, x, y, width);
                } finally {
                    this.drawText = originalDrawText;
                }
            };
        }

        if (listProto && typeof listProto.updateHelp === 'function') {
            const originalUpdateHelp = listProto.updateHelp;

            listProto.updateHelp = function () {
                const runtime = getRuntime();
                const selectedSkillData = typeof this.item === 'function' ? this.item() : null;
                if (
                    !runtime ||
                    !selectedSkillData ||
                    typeof selectedSkillData !== 'object' ||
                    !isUsableText(selectedSkillData.HelpPostscript)
                ) {
                    return originalUpdateHelp.apply(this, arguments);
                }

                const sourcePostscript = String(selectedSkillData.HelpPostscript);
                const translatedPostscript = translateRuntimeText(runtime, sourcePostscript);
                if (translatedPostscript === sourcePostscript) {
                    return originalUpdateHelp.apply(this, arguments);
                }

                const originalPostscript = selectedSkillData.HelpPostscript;
                selectedSkillData.HelpPostscript = translatedPostscript;
                try {
                    return originalUpdateHelp.apply(this, arguments);
                } finally {
                    selectedSkillData.HelpPostscript = originalPostscript;
                }
            };
        }

        const confirmProto = window.Window_LearnSkillConfirm?.prototype;
        if (confirmProto && typeof confirmProto.makeCommandList === 'function') {
            const originalMakeCommandList = confirmProto.makeCommandList;

            confirmProto.makeCommandList = function () {
                const result = originalMakeCommandList.apply(this, arguments);
                const okText = resolveParameterText(PARAM_CONFIRM_BUTTON_OK);
                const cancelText = resolveParameterText(PARAM_CONFIRM_BUTTON_CANCEL);
                if (!Array.isArray(this._list)) {
                    return result;
                }

                for (const entry of this._list) {
                    if (entry?.name === okText || entry?.name === cancelText) {
                        const runtime = getRuntime();
                        if (!runtime) {
                            continue;
                        }

                        const sourceText = String(entry.name);
                        const translated = translateRuntimeText(runtime, sourceText);
                        if (isUsableText(translated)) {
                            entry.name = translated;
                        }
                    }
                }

                return result;
            };
        }

        if (confirmProto && typeof confirmProto.drawAllItems === 'function') {
            confirmProto.drawAllItems = function () {
                const paramSkill = this._skillData;
                const dataSkill = this.dataSkill();
                if (!dataSkill) {
                    return;
                }

                const runtime = getRuntime();
                const confirmTemplate = resolveParameterText(PARAM_CONFIRM_MESSAGE);
                const templateText = runtime
                    ? translateRuntimeText(runtime, confirmTemplate)
                    : confirmTemplate;

                let maxWidth = 0;
                let lineCount = 0;

                let skillPoint = 0;
                if (paramSkill.SkillPoint) {
                    skillPoint = eval(paramSkill.SkillPoint);
                }

                const templateLines = String(templateText || '').split('\n');
                for (const line of templateLines) {
                    const message = line.format(
                        dataSkill.name,
                        String.raw`\i[${dataSkill.iconIndex}]`,
                        skillPoint
                    );
                    const newWidth = this.textSizeEx(message).width + this.itemPadding() * 4;
                    maxWidth = Math.max(maxWidth, newWidth);
                    this.drawTextEx(
                        message,
                        this.itemPadding(),
                        this.itemPadding() + lineCount * this.lineHeight()
                    );
                    lineCount += 1;
                }

                lineCount += 1;
                this.width = maxWidth;
                this.height = this.lineHeight() * lineCount + this.fittingHeight(2);
                this.x = (Graphics.boxWidth - this.width) / 2;
                this.y = (Graphics.boxHeight - this.height) / 2;

                const topIndex = this.topIndex();
                for (let i = 0; i < this.maxVisibleItems(); i += 1) {
                    const index = topIndex + i;
                    if (index < this.maxItems()) {
                        this.drawItemBackground(index);
                        this.drawItem(index);
                    }
                }
            };
        }

        this._patchFallbackWindowTranslation();
        this._patchHelpWindowTranslation();

        Object.defineProperty(menuProto, HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    _patchFallbackWindowTranslation() {
        const baseProto = window.Window_Base?.prototype;
        if (
            !baseProto ||
            typeof baseProto.drawText !== 'function' ||
            baseProto[FALLBACK_HOOK_FLAG]
        ) {
            return;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateRuntimeText = this._translateRuntimeText.bind(this);
        const translateByTemplate = this._translateTextFromTemplate.bind(this);
        const resolveParameterText = this._resolveParameterText.bind(this);
        const originalDrawText = baseProto.drawText;
        const originalDrawTextEx =
            typeof baseProto.drawTextEx === 'function' ? baseProto.drawTextEx : null;

        baseProto.drawText = function (text, x, y, maxWidth, align) {
            let nextText = text;
            const runtime = getRuntime();
            if (
                runtime &&
                isRuntimeTranslationActive(runtime) &&
                typeof text === 'string' &&
                this?.constructor?.name !== 'Window_Help'
            ) {
                const sceneName = String(window.SceneManager?._scene?.constructor?.name || '');
                if (/LearnSkill|SkillList/i.test(sceneName)) {
                    nextText = translateByTemplate(
                        runtime,
                        translateRuntimeText(runtime, text),
                        resolveParameterText(PARAM_CONFIRM_MESSAGE)
                    );
                }
            }

            return originalDrawText.call(this, nextText, x, y, maxWidth, align);
        };

        if (originalDrawTextEx) {
            baseProto.drawTextEx = function (text, x, y, width) {
                let nextText = text;
                const runtime = getRuntime();
                if (
                    runtime &&
                    isRuntimeTranslationActive(runtime) &&
                    typeof text === 'string' &&
                    this?.constructor?.name !== 'Window_Help'
                ) {
                    const sceneName = String(window.SceneManager?._scene?.constructor?.name || '');
                    if (/LearnSkill|SkillList/i.test(sceneName)) {
                        nextText = translateByTemplate(
                            runtime,
                            translateRuntimeText(runtime, text),
                            resolveParameterText(PARAM_CONFIRM_MESSAGE)
                        );
                    }
                }

                return originalDrawTextEx.call(this, nextText, x, y, width);
            };
        }

        Object.defineProperty(baseProto, FALLBACK_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _patchHelpWindowTranslation() {
        const helpProto = window.Window_Help?.prototype;
        if (
            !helpProto ||
            typeof helpProto.setText !== 'function' ||
            helpProto[HELP_WINDOW_HOOK_FLAG]
        ) {
            return;
        }

        const originalSetText = helpProto.setText;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateRuntimeText = this._translateRuntimeText.bind(this);
        const translateByTemplate = this._translateTextFromTemplate.bind(this);
        const resolveParameterText = this._resolveParameterText.bind(this);
        const translateKnownHelpPostscriptText = this._translateKnownHelpPostscriptText.bind(this);

        helpProto.setText = function (text) {
            console.log('[NRP_LearnSkillListTranslator] Window_Help setText:', text);
            let nextText = text;
            const runtime = getRuntime();
            if (runtime && isRuntimeTranslationActive(runtime) && typeof text === 'string') {
                const sceneName = String(window.SceneManager?._scene?.constructor?.name || '');
                if (/LearnSkill|SkillList/i.test(sceneName)) {
                    const confirmTemplate = resolveParameterText(PARAM_CONFIRM_MESSAGE);
                    nextText = translateKnownHelpPostscriptText(
                        runtime,
                        translateByTemplate(
                            runtime,
                            translateRuntimeText(runtime, String(text)),
                            confirmTemplate
                        )
                    );
                }
            }

            return originalSetText.call(this, nextText);
        };

        Object.defineProperty(helpProto, HELP_WINDOW_HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    _translateKnownHelpPostscriptText(runtime, sourceText) {
        if (!this.isUsableText(sourceText)) {
            return sourceText;
        }

        let nextText = String(sourceText);
        console.log('[NRP_LearnSkillListTranslator] Translating help postscript text:', nextText);
        for (const postscript of this._getKnownHelpPostscriptEntries()) {
            if (!nextText.endsWith(postscript)) {
                continue;
            }

            const translated = this._translateRuntimeText(runtime, postscript);
            if (this.isUsableText(translated) && translated !== postscript) {
                nextText = nextText.replaceAll(postscript, translated);
            }
        }

        return nextText;
    }

    _getKnownHelpPostscriptEntries() {
        const entries = this.buildScanEntries();
        const seen = new Set();
        const output = [];
        for (const entry of entries) {
            if (entry?.source?.field !== 'HelpPostscript') {
                continue;
            }

            const text = String(entry?.text || '');
            if (!this.isUsableText(text) || seen.has(text)) {
                continue;
            }

            seen.add(text);
            output.push(text);
        }

        return output;
    }

    _translateTextFromTemplate(runtime, sourceText, templateText) {
        if (!this.isUsableText(sourceText) || !this.isUsableText(templateText)) {
            return sourceText;
        }

        const template = String(templateText);
        if (!/%\d+/.test(template)) {
            return sourceText;
        }

        const translatedTemplate = this.resolveRuntimeTranslation(
            template,
            runtime,
            this.getCacheType(),
            {
                requireRuntimeTranslationActive: true,
                missValue: template,
                harvestMissing: false,
            }
        );
        if (!this.isUsableText(translatedTemplate)) {
            return sourceText;
        }

        const placeholders = [];
        const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
        const regexSource = escaped.replace(/%(\d+)/g, (_match, token) => {
            placeholders.push(token);
            return String.raw`([\s\S]*?)`;
        });
        const match = new RegExp(`^${regexSource}$`).exec(String(sourceText));
        if (!match) {
            return sourceText;
        }

        let rebuilt = String(translatedTemplate);
        for (let i = 0; i < placeholders.length; i += 1) {
            const token = placeholders[i];
            const value = String(match[i + 1] || '');
            rebuilt = rebuilt.replaceAll(`%${token}`, value);
        }

        return rebuilt;
    }

    _translateRuntimeText(runtime, sourceText) {
        if (!this.isUsableText(sourceText)) {
            return sourceText;
        }

        const translated = this.resolveRuntimeTranslation(
            sourceText,
            runtime,
            this.getCacheType(),
            {
                requireRuntimeTranslationActive: true,
                missValue: sourceText,
                harvestMissing: false,
            }
        );
        return this.isUsableText(translated) ? translated : sourceText;
    }

    _resolveParameterSources() {
        const sources = [];
        const aliases = this.getPluginAliases();
        for (const alias of aliases) {
            const pluginEntry = this.findPluginEntry(alias);
            if (pluginEntry?.parameters && typeof pluginEntry.parameters === 'object') {
                sources.push({ scope: 'pluginEntryParameter', parameters: pluginEntry.parameters });
            }

            if (typeof window.PluginManager?.parameters === 'function') {
                const runtimeParameters = window.PluginManager.parameters(alias);
                if (runtimeParameters && typeof runtimeParameters === 'object') {
                    sources.push({
                        scope: 'runtimePluginManagerParameter',
                        parameters: runtimeParameters,
                    });
                }
            }
        }

        return sources;
    }

    _appendIfUsable(output, text, source, field) {
        if (!Array.isArray(output) || !this.isUsableText(text)) {
            return;
        }

        output.push({
            text: String(text),
            source: {
                scope: source.scope,
                field,
            },
        });
    }

    _appendTopLevelEntries(output, source) {
        const parameters = source.parameters;
        this._appendIfUsable(
            output,
            parameters?.[PARAM_SKILL_POINT_NAME],
            source,
            PARAM_SKILL_POINT_NAME
        );
        this._appendIfUsable(
            output,
            parameters?.[PARAM_SKILL_POINT_MESSAGE],
            source,
            PARAM_SKILL_POINT_MESSAGE
        );
        this._appendIfUsable(output, parameters?.[PARAM_LEARNED_TEXT], source, PARAM_LEARNED_TEXT);
        this._appendIfUsable(
            output,
            parameters?.[PARAM_HIDDEN_SYMBOL],
            source,
            PARAM_HIDDEN_SYMBOL
        );
        this._appendIfUsable(
            output,
            parameters?.[PARAM_HIDDEN_SKILL_MASK],
            source,
            PARAM_HIDDEN_SKILL_MASK
        );
        this._appendIfUsable(
            output,
            parameters?.[PARAM_CONFIRM_MESSAGE],
            source,
            PARAM_CONFIRM_MESSAGE
        );
        this._appendIfUsable(
            output,
            parameters?.[PARAM_CONFIRM_BUTTON_OK],
            source,
            PARAM_CONFIRM_BUTTON_OK
        );
        this._appendIfUsable(
            output,
            parameters?.[PARAM_CONFIRM_BUTTON_CANCEL],
            source,
            PARAM_CONFIRM_BUTTON_CANCEL
        );
        this._appendIfUsable(output, parameters?.[PARAM_COMMAND_NAME], source, PARAM_COMMAND_NAME);
    }

    _appendNestedSkillEntries(output, source) {
        const rawSkillSets = parseJsonSafely(source.parameters?.[PARAM_SKILL_SET_LIST], []);
        if (!Array.isArray(rawSkillSets)) {
            return;
        }

        for (const rawSkillSet of rawSkillSets) {
            const skillSet = parseJsonSafely(rawSkillSet, null);
            if (!skillSet || typeof skillSet !== 'object') {
                continue;
            }

            this._appendSkillObjectEntries(output, skillSet, source);

            const rawSkillList = parseJsonSafely(skillSet.SkillList, []);
            if (!Array.isArray(rawSkillList)) {
                continue;
            }

            for (const rawSkill of rawSkillList) {
                const skillData = parseJsonSafely(rawSkill, null);
                if (!skillData || typeof skillData !== 'object') {
                    continue;
                }

                this._appendSkillObjectEntries(output, skillData, source);
            }
        }
    }

    _appendSkillObjectEntries(output, object, source) {
        if (!object || typeof object !== 'object') {
            return;
        }

        for (const key of Object.keys(object)) {
            if (!TEXT_FIELDS.has(key)) {
                continue;
            }

            const text = object[key];
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text: String(text),
                source: {
                    scope: source.scope,
                    field: key,
                },
            });
        }
    }

    _resolveParameterText(field) {
        for (const source of this._resolveParameterSources()) {
            const value = source.parameters?.[field];
            if (this.isUsableText(value)) {
                return String(value);
            }
        }

        return '';
    }

    _buildUniquePendingItems(runtime) {
        if (!this._scanPrepared) {
            this._scanEntries = this.buildScanEntries();
            this._scanPrepared = true;
        }

        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_nrp_learn_skill_list_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
        }

        return Array.from(byCacheKey.values());
    }
}
