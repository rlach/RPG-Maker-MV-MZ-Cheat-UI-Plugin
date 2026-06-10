import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * Translator for SkillTree.js + SkillTreeConfig.js by unagi ootoro.
 *
 * Supported versions:
 * - SkillTree v1.6.0 (MV/MZ)
 *
 * Notes:
 * - SkillTree caches many UI terms into closure constants at plugin boot.
 * - SkillTreeConfig stores tree type names/descriptions/help text in a JS object literal.
 * - Type identifiers / derivative node tags are logic keys and must not be translated.
 */

const CACHE_TYPE = 'plugin_skilltree';

const SKILL_TREE_TEXT_PARAM_KEYS = [
    'SpName',
    'MenuSkillTreeText',
    'NeedSpText',
    'OpenedNodeText',
    'NodeOpenConfirmationText',
    'NodeOpenYesText',
    'NodeOpenNoText',
    'BattleEndGetSpText',
    'LevelUpGetSpText',
];

const SKILL_TREE_WINDOW_NAMES = new Set([
    'Window_TypeSelect',
    'Window_ActorInfo',
    'Window_SkillTreeNodeInfo',
    'Window_NodeOpen',
    'Window_MenuCommand',
]);

export class SkillTreeTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._sourceTexts = new Set();
        this._formatTemplates = [];
        this._configScanStarted = false;
    }

    getPluginName() {
        return 'SkillTree';
    }

    getPluginLabel() {
        return 'SkillTree / SkillTreeConfig';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    _getSkillTreePluginParameters() {
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const parameters = pluginEntry?.parameters;
        if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
            return null;
        }
        return parameters;
    }

    _pushEntry(entries, text, source) {
        if (!this.isUsableText(text)) {
            return;
        }

        entries.push({ text: String(text), source });
    }

    _buildParameterEntries() {
        const parameters = this._getSkillTreePluginParameters();
        if (!parameters) {
            return [];
        }

        const entries = [];
        for (const key of SKILL_TREE_TEXT_PARAM_KEYS) {
            this._pushEntry(entries, parameters[key], { scope: 'pluginParameters', key });
        }

        const needSpText = String(parameters.NeedSpText || '');
        const spName = String(parameters.SpName || '');
        if (this.isUsableText(needSpText) && this.isUsableText(spName)) {
            this._pushEntry(entries, needSpText.format(spName), {
                scope: 'pluginParameters',
                key: 'NeedSpText:rendered',
            });
        }

        return entries;
    }

    async _loadSkillTreeConfigData() {
        let response;
        try {
            response = await fetch('js/plugins/SkillTreeConfig.js');
        } catch (error) {
            console.warn('[SkillTreeTranslator] Failed to fetch SkillTreeConfig.js', error);
            return null;
        }

        if (!response?.ok) {
            return null;
        }

        let source;
        try {
            source = await response.text();
        } catch (error) {
            console.warn('[SkillTreeTranslator] Failed to read SkillTreeConfig.js', error);
            return null;
        }

        try {
            const resolver = new Function(
                `${source}\nreturn (typeof loadSkillTreeConfig === 'function') ? loadSkillTreeConfig() : null;`
            );
            const config = resolver();
            if (!config || typeof config !== 'object') {
                return null;
            }
            return config;
        } catch (error) {
            console.warn('[SkillTreeTranslator] Failed to evaluate SkillTreeConfig.js', error);
            return null;
        }
    }

    _collectSkillTreeTypeEntries(skillTreeTypes, entries) {
        for (let actorIdx = 0; actorIdx < skillTreeTypes.length; actorIdx++) {
            const actorTypeConfig = skillTreeTypes[actorIdx];
            const types = Array.isArray(actorTypeConfig?.types) ? actorTypeConfig.types : [];

            for (let typeIdx = 0; typeIdx < types.length; typeIdx++) {
                const typeData = Array.isArray(types[typeIdx]) ? types[typeIdx] : null;
                if (!typeData) {
                    continue;
                }

                // typeData[0] is an identifier used by plugin logic; do not translate it.
                this._pushEntry(entries, typeData[1], {
                    scope: 'skillTreeConfig',
                    section: 'skillTreeTypes',
                    field: 'typeName',
                    actorIdx,
                    typeIdx,
                });
                this._pushEntry(entries, typeData[2], {
                    scope: 'skillTreeConfig',
                    section: 'skillTreeTypes',
                    field: 'typeDescription',
                    actorIdx,
                    typeIdx,
                });
            }
        }
    }

    _collectSkillTreeInfoHelpEntries(skillTreeInfo, entries) {
        for (let infoIdx = 0; infoIdx < skillTreeInfo.length; infoIdx++) {
            const infoData = Array.isArray(skillTreeInfo[infoIdx]) ? skillTreeInfo[infoIdx] : null;
            if (!infoData) {
                continue;
            }

            // infoData[0] is a node identifier used by derivative definitions; do not translate it.
            this._pushEntry(entries, infoData[4], {
                scope: 'skillTreeConfig',
                section: 'skillTreeInfo',
                field: 'helpMessage',
                infoIdx,
            });
        }
    }

    _collectConfigEntries(configData, entries) {
        if (!configData || typeof configData !== 'object') {
            return;
        }

        const skillTreeTypes = Array.isArray(configData.skillTreeTypes)
            ? configData.skillTreeTypes
            : [];
        this._collectSkillTreeTypeEntries(skillTreeTypes, entries);

        const skillTreeInfo = Array.isArray(configData.skillTreeInfo)
            ? configData.skillTreeInfo
            : [];
        this._collectSkillTreeInfoHelpEntries(skillTreeInfo, entries);
    }

    _refreshDerivedSetsFromEntries() {
        this._sourceTexts.clear();
        this._formatTemplates = [];

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            this._sourceTexts.add(text);

            if (/%\d+/.test(text)) {
                const compiled = this._buildFormatTemplateMatcher(text);
                if (compiled) {
                    this._formatTemplates.push(compiled);
                }
            }
        }
    }

    _escapeRegex(text) {
        return String(text).replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    }

    _buildFormatTemplateMatcher(template) {
        const tokenRegex = /%(\d+)/g;
        let match;
        let lastIndex = 0;
        let pattern = '^';
        const tokenIndexes = [];

        while ((match = tokenRegex.exec(template)) !== null) {
            const literal = template.slice(lastIndex, match.index);
            pattern += this._escapeRegex(literal);
            pattern += String.raw`([\s\S]*?)`;
            tokenIndexes.push(Number(match[1]));
            lastIndex = match.index + match[0].length;
        }

        if (tokenIndexes.length === 0) {
            return null;
        }

        pattern += this._escapeRegex(template.slice(lastIndex));
        pattern += '$';

        return {
            template,
            regex: new RegExp(pattern),
            tokenIndexes,
            maxTokenIndex: Math.max(...tokenIndexes),
        };
    }

    _tryTranslateFormattedText(text, translateText) {
        for (const matcher of this._formatTemplates) {
            const matched = matcher.regex.exec(text);
            if (!matched) {
                continue;
            }

            const translatedTemplate = translateText(matcher.template);
            if (!this.isUsableText(translatedTemplate) || translatedTemplate === matcher.template) {
                continue;
            }

            if (typeof translatedTemplate.format !== 'function') {
                continue;
            }

            const args = new Array(matcher.maxTokenIndex).fill('');
            for (let i = 0; i < matcher.tokenIndexes.length; i++) {
                const tokenIndex = matcher.tokenIndexes[i];
                if (args[tokenIndex - 1] === '') {
                    args[tokenIndex - 1] = matched[i + 1];
                }
            }

            return translatedTemplate.format(...args);
        }

        return text;
    }

    _seedParameterEntriesForRuntimeHooks() {
        if (this._scanEntries.length > 0) {
            return;
        }

        this._scanEntries = this._buildParameterEntries();
        this._refreshDerivedSetsFromEntries();
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
                this._refreshDerivedSetsFromEntries();
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[SkillTreeTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = this._buildParameterEntries();

        const configData = await this._loadSkillTreeConfigData();
        this._collectConfigEntries(configData, entries);

        return entries;
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_skilltree_${byCacheKey.size}`,
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

        if (!this._scanPrepared && this._scanEntries.length === 0) {
            this._scanEntries = this._buildParameterEntries();
            this._refreshDerivedSetsFromEntries();
        }

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        if (!this._scanPrepared && this._scanEntries.length === 0) {
            this._scanEntries = this._buildParameterEntries();
            this._refreshDerivedSetsFromEntries();
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
        if (typeof Window_Base?.prototype?.drawText !== 'function') {
            return false;
        }

        if (typeof Window_Help?.prototype?.setText !== 'function') {
            return false;
        }

        this._seedParameterEntriesForRuntimeHooks();

        const translateText = (text) => {
            const runtime = this.getRuntime();
            if (!this.isRuntimeTranslationActive(runtime)) {
                return text;
            }

            return this.resolveRuntimeTranslation(text, runtime, this.getCacheType(), {
                requireRuntimeTranslationActive: true,
                missValue: text,
            });
        };

        if (!Window_Base.prototype._skillTreeTranslatorDrawTextHooked) {
            const originalDrawText = Window_Base.prototype.drawText;
            Window_Base.prototype.drawText = function (text, x, y, maxWidth, align) {
                let renderedText = text;
                try {
                    const windowName = this?.constructor?.name || '';
                    if (
                        typeof text === 'string' &&
                        SKILL_TREE_WINDOW_NAMES.has(windowName) &&
                        text.trim()
                    ) {
                        if (this._skillTreeTranslator?.sourceTexts?.has(text)) {
                            renderedText = this._skillTreeTranslator.translateText(text);
                        } else {
                            renderedText = this._skillTreeTranslator.tryTranslateFormattedText(
                                text,
                                this._skillTreeTranslator.translateText
                            );
                        }
                    }
                } catch (error) {
                    console.warn('[SkillTreeTranslator] drawText hook failed', error);
                }

                return originalDrawText.call(this, renderedText, x, y, maxWidth, align);
            };

            Window_Base.prototype._skillTreeTranslator = {
                translateText,
                sourceTexts: this._sourceTexts,
                tryTranslateFormattedText: this._tryTranslateFormattedText.bind(this),
            };

            Object.defineProperty(Window_Base.prototype, '_skillTreeTranslatorDrawTextHooked', {
                value: true,
                configurable: true,
                enumerable: false,
                writable: true,
            });
        }

        if (!Window_Help.prototype._skillTreeTranslatorSetTextHooked) {
            const originalSetText = Window_Help.prototype.setText;
            Window_Help.prototype.setText = function (text) {
                let nextText = text;
                try {
                    if (typeof text === 'string' && text.trim()) {
                        if (this._skillTreeTranslator?.sourceTexts?.has(text)) {
                            nextText = this._skillTreeTranslator.translateText(text);
                        } else {
                            nextText = this._skillTreeTranslator.tryTranslateFormattedText(
                                text,
                                this._skillTreeTranslator.translateText
                            );
                        }
                    }
                } catch (error) {
                    console.warn('[SkillTreeTranslator] Window_Help.setText hook failed', error);
                }

                return originalSetText.call(this, nextText);
            };

            Window_Help.prototype._skillTreeTranslator = {
                translateText,
                sourceTexts: this._sourceTexts,
                tryTranslateFormattedText: this._tryTranslateFormattedText.bind(this),
            };

            Object.defineProperty(Window_Help.prototype, '_skillTreeTranslatorSetTextHooked', {
                value: true,
                configurable: true,
                enumerable: false,
                writable: true,
            });
        }

        if (!this._configScanStarted) {
            this._configScanStarted = true;
            this.precomputeCounts().catch((error) => {
                console.warn('[SkillTreeTranslator] Deferred config scan failed', error);
            });
        }

        return true;
    }
}
