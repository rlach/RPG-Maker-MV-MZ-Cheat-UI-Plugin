import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const COMMAND_CACHE_TYPE = 'command';
const QUEST_ENTRY_KEY_REGEX = /^Quest\s+\d+$/i;

const PLAIN_PARAMETER_CONFIGS = [{ key: 'Quest Command', cacheType: COMMAND_CACHE_TYPE }];

const CATEGORY_WINDOW_FIELD_CONFIGS = [
    { key: 'Available Text', cacheType: COMMAND_CACHE_TYPE },
    { key: 'Completed Text', cacheType: COMMAND_CACHE_TYPE },
    { key: 'Failed Text', cacheType: COMMAND_CACHE_TYPE },
    { key: 'All Text', cacheType: COMMAND_CACHE_TYPE },
    { key: 'Cancel Text', cacheType: COMMAND_CACHE_TYPE },
];

const LIST_WINDOW_FIELD_CONFIGS = [
    { key: 'Type Order', cacheType: COMMAND_CACHE_TYPE, array: true },
    { key: 'Type Text Format', cacheType: COMMAND_CACHE_TYPE },
    { key: 'Read Quest', cacheType: COMMAND_CACHE_TYPE },
    { key: 'Cancel', cacheType: COMMAND_CACHE_TYPE },
];

const TITLE_WINDOW_FIELD_CONFIGS = [{ key: 'No Quest Title', cacheType: COMMAND_CACHE_TYPE }];

const DATA_WINDOW_FIELD_CONFIGS = [
    { key: 'No Data Text' },
    { key: 'Quest Data Format' },
    { key: 'Uncleared Objective' },
    { key: 'Completed Objective' },
    { key: 'Failed Objective' },
    { key: 'Unclaimed Reward' },
    { key: 'Claimed Reward' },
    { key: 'Denied Reward' },
];

const QUEST_FIELD_CONFIGS = [
    { key: 'Title', cacheType: COMMAND_CACHE_TYPE },
    { key: 'Type', cacheType: COMMAND_CACHE_TYPE },
    { key: 'Difficulty' },
    { key: 'From' },
    { key: 'Location' },
    { key: 'Description', array: true },
    { key: 'Objectives List', array: true },
    { key: 'Rewards List', array: true },
    { key: 'Subtext', array: true },
];

const QUEST_TITLE_ICON_REGEX = /\\I\[\d+\]/gi;
const QUEST_TITLE_COLOR_REGEX = /\\C\[\d+\]/gi;

function normalizeNoteValue(value) {
    let result = value;
    for (let i = 0; i < 3; i++) {
        const parsed = parseJsonSafely(result, result);
        if (parsed === result) {
            break;
        }

        result = parsed;
    }

    return typeof result === 'string' ? result : '';
}

function parseNoteArray(rawValue, translator) {
    const parsed = parseJsonSafely(rawValue, []);
    if (!Array.isArray(parsed)) {
        return [];
    }

    const output = [];
    for (const entry of parsed) {
        const normalized = normalizeNoteValue(entry);
        if (translator.isUsableText(normalized)) {
            output.push(normalized);
        }
    }

    return output;
}

function parseObjectStruct(rawValue) {
    const parsed = parseJsonSafely(rawValue, null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }

    return parsed;
}

function buildQuestTitleVariants(value, translator) {
    const normalized = normalizeNoteValue(value);
    if (!translator.isUsableText(normalized)) {
        return [];
    }

    const variants = [normalized];
    const plain = normalized
        .replaceAll(QUEST_TITLE_ICON_REGEX, '')
        .replaceAll(QUEST_TITLE_COLOR_REGEX, '')
        .trim();

    if (translator.isUsableText(plain) && plain !== normalized) {
        variants.push(plain);
    }

    return variants;
}

export class YepQuestJournalTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'YEP_QuestJournal';
    }

    getPluginLabel() {
        return 'YEP QuestJournal';
    }

    getCacheType() {
        return 'plugin_yep_quest_journal';
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const normalizedName = String(this.getPluginName() || '')
            .trim()
            .toLowerCase();

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === normalizedName;
            }) || null
        );
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

    addEntry(output, text, source, cacheType = this.getCacheType()) {
        if (!Array.isArray(output) || !this.isUsableText(text)) {
            return;
        }

        output.push({
            text,
            cacheType,
            source,
        });
    }

    appendTextFieldEntries(output, sourceScope, objectValue, fieldConfigs) {
        if (!objectValue || typeof objectValue !== 'object') {
            return;
        }

        for (const config of fieldConfigs) {
            const fieldValue = objectValue[config.key];
            if (!this.isUsableText(fieldValue)) {
                continue;
            }

            if (config.array) {
                const values = parseNoteArray(fieldValue, this);
                for (let i = 0; i < values.length; i++) {
                    this.addEntry(
                        output,
                        values[i],
                        {
                            scope: sourceScope,
                            field: config.key,
                            index: i,
                        },
                        config.cacheType
                    );
                }
                continue;
            }

            this.addEntry(
                output,
                normalizeNoteValue(fieldValue),
                {
                    scope: sourceScope,
                    field: config.key,
                },
                config.cacheType
            );
        }
    }

    appendWindowStructEntries(output, sourceScope, parameters) {
        const categoryWindow = parseObjectStruct(parameters['Quest Category Window']);
        if (categoryWindow) {
            this.appendTextFieldEntries(
                output,
                `${sourceScope}:questCategoryWindow`,
                categoryWindow,
                CATEGORY_WINDOW_FIELD_CONFIGS
            );
        }

        const listWindow = parseObjectStruct(parameters['Quest List Window']);
        if (listWindow) {
            this.appendTextFieldEntries(
                output,
                `${sourceScope}:questListWindow`,
                listWindow,
                LIST_WINDOW_FIELD_CONFIGS
            );
        }

        const titleWindow = parseObjectStruct(parameters['Quest Title Window']);
        if (titleWindow) {
            this.appendTextFieldEntries(
                output,
                `${sourceScope}:questTitleWindow`,
                titleWindow,
                TITLE_WINDOW_FIELD_CONFIGS
            );
        }

        const dataWindow = parseObjectStruct(parameters['Quest Data Window']);
        if (dataWindow) {
            this.appendTextFieldEntries(
                output,
                `${sourceScope}:questDataWindow`,
                dataWindow,
                DATA_WINDOW_FIELD_CONFIGS
            );
        }
    }

    appendQuestEntries(output, sourceScope, parameters) {
        const appendQuestField = (questKey, fieldConfig, fieldValue) => {
            if (!this.isUsableText(fieldValue)) {
                return;
            }

            if (fieldConfig.array) {
                const values = parseNoteArray(fieldValue, this);
                for (let i = 0; i < values.length; i++) {
                    this.addEntry(
                        output,
                        values[i],
                        {
                            scope: sourceScope,
                            questKey,
                            field: fieldConfig.key,
                            index: i,
                        },
                        fieldConfig.cacheType
                    );
                }
                return;
            }

            if (fieldConfig.key === 'Title' && fieldConfig.cacheType === COMMAND_CACHE_TYPE) {
                const titleVariants = buildQuestTitleVariants(fieldValue, this);
                for (const variant of titleVariants) {
                    this.addEntry(
                        output,
                        variant,
                        {
                            scope: sourceScope,
                            questKey,
                            field: fieldConfig.key,
                        },
                        fieldConfig.cacheType
                    );
                }
                return;
            }

            this.addEntry(
                output,
                normalizeNoteValue(fieldValue),
                {
                    scope: sourceScope,
                    questKey,
                    field: fieldConfig.key,
                },
                fieldConfig.cacheType
            );
        };

        for (const [key, value] of Object.entries(parameters)) {
            if (!QUEST_ENTRY_KEY_REGEX.test(String(key || ''))) {
                continue;
            }

            const quest = parseObjectStruct(value);
            if (!quest) {
                continue;
            }

            for (const fieldConfig of QUEST_FIELD_CONFIGS) {
                appendQuestField(key, fieldConfig, quest[fieldConfig.key]);
            }
        }
    }

    appendParameterBagEntries(output, sourceScope, parameters) {
        if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
            return;
        }

        this.appendTextFieldEntries(output, sourceScope, parameters, PLAIN_PARAMETER_CONFIGS);
        this.appendWindowStructEntries(output, sourceScope, parameters);
        this.appendQuestEntries(output, sourceScope, parameters);
    }

    buildScanEntries() {
        const output = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.appendParameterBagEntries(output, 'pluginEntryParameters', pluginEntry.parameters);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.appendParameterBagEntries(output, 'runtimePluginParameters', runtimeParameters);
        }

        return output;
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
                console.warn('[YepQuestJournalTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    resolveCachedText(runtime, text, cacheTypes = [this.getCacheType()]) {
        if (!this.isUsableText(text)) {
            return text;
        }

        if (!this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        for (const cacheType of cacheTypes) {
            const cacheKey = runtime.getCacheKey(text, cacheType);
            runtime.trackCacheKeyUsage(cacheKey);
            if (!runtime.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            const cached = runtime.translationCache.get(cacheKey);
            if (this.isUsableText(cached)) {
                return cached;
            }
        }

        return text;
    }

    translateCommandListEntries(windowInstance) {
        if (!windowInstance || !Array.isArray(windowInstance._list)) {
            return;
        }

        const runtime = this.getRuntime();
        if (!this.isRuntimeTranslationActive(runtime)) {
            return;
        }

        for (const command of windowInstance._list) {
            if (!command || !this.isUsableText(command.name)) {
                continue;
            }

            command.name = this.resolveCachedText(runtime, command.name, [
                COMMAND_CACHE_TYPE,
                this.getCacheType(),
            ]);
        }
    }

    installCommandListHook(klass, guardKey) {
        if (!klass?.prototype || typeof klass.prototype.makeCommandList !== 'function') {
            return;
        }

        if (klass.prototype[guardKey]) {
            return;
        }

        const translateCommandListEntries = this.translateCommandListEntries.bind(this);
        const original = klass.prototype.makeCommandList;
        klass.prototype.makeCommandList = function () {
            const result = original.apply(this, arguments);
            translateCommandListEntries(this);
            return result;
        };

        klass.prototype[guardKey] = true;
    }

    installQuestTitleHook() {
        const klass = window.Window_QuestTitle;
        const guardKey = '__CHEAT_YEP_QUEST_JOURNAL_TITLE_SET_TEXT_HOOKED__';

        if (!klass?.prototype || typeof klass.prototype.setText !== 'function') {
            return;
        }

        if (klass.prototype[guardKey]) {
            return;
        }

        const getRuntime = this.getRuntime.bind(this);
        const resolveCachedText = this.resolveCachedText.bind(this);
        const original = klass.prototype.setText;
        klass.prototype.setText = function (text) {
            const runtime = getRuntime();
            const translated = resolveCachedText(runtime, text, [COMMAND_CACHE_TYPE]);
            return original.call(this, translated);
        };

        klass.prototype[guardKey] = true;
    }

    installQuestDataHooks() {
        const klass = window.Window_QuestData;
        if (!klass?.prototype) {
            return;
        }

        const getRuntime = this.getRuntime.bind(this);
        const resolveCachedText = this.resolveCachedText.bind(this);
        const getCacheType = this.getCacheType.bind(this);

        if (
            typeof klass.prototype.getQuestDescription === 'function' &&
            !klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_GET_DESCRIPTION_HOOKED__
        ) {
            const originalGetQuestDescription = klass.prototype.getQuestDescription;
            klass.prototype.getQuestDescription = function () {
                const text = originalGetQuestDescription.apply(this, arguments);
                return resolveCachedText(getRuntime(), text, [getCacheType()]);
            };
            klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_GET_DESCRIPTION_HOOKED__ = true;
        }

        if (
            typeof klass.prototype.getQuestSubtext === 'function' &&
            !klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_GET_SUBTEXT_HOOKED__
        ) {
            const originalGetQuestSubtext = klass.prototype.getQuestSubtext;
            klass.prototype.getQuestSubtext = function () {
                const text = originalGetQuestSubtext.apply(this, arguments);
                return resolveCachedText(getRuntime(), text, [getCacheType()]);
            };
            klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_GET_SUBTEXT_HOOKED__ = true;
        }

        if (
            typeof klass.prototype.getQuestObjectives === 'function' &&
            !klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_GET_OBJECTIVES_HOOKED__
        ) {
            klass.prototype.getQuestObjectives = function (wordwrap) {
                const questData = $dataQuests[this._questId];
                const lineData = questData.objectives;
                const visibleObjectives = $gameSystem.getQuestObjectives(this._questId);
                const length = visibleObjectives.length;
                let text = '';
                const runtime = getRuntime();
                for (let i = 0; i < length; ++i) {
                    if (i > 0) text += wordwrap ? '<br>' : '\n';
                    const objectiveId = visibleObjectives[i];
                    const key = $gameSystem.getQuestObjectiveStatus(this._questId, objectiveId);
                    let fmt = this.settings(key);
                    fmt = resolveCachedText(runtime, fmt, [getCacheType()]);
                    let rawObjectiveText = JSON.parse(lineData[objectiveId]);
                    rawObjectiveText = resolveCachedText(runtime, rawObjectiveText, [
                        getCacheType(),
                    ]);
                    text += fmt.format(rawObjectiveText);
                }
                return text;
            };
            klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_GET_OBJECTIVES_HOOKED__ = true;
        }

        if (
            typeof klass.prototype.getQuestRewards === 'function' &&
            !klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_GET_REWARDS_HOOKED__
        ) {
            klass.prototype.getQuestRewards = function (wordwrap) {
                const questData = $dataQuests[this._questId];
                const lineData = questData.rewards;
                const visibleRewards = $gameSystem.getQuestRewards(this._questId);
                const length = visibleRewards.length;
                let text = '';
                const runtime = getRuntime();
                for (let i = 0; i < length; ++i) {
                    if (i > 0) text += wordwrap ? '<br>' : '\n';
                    const rewardId = visibleRewards[i];
                    const key = $gameSystem.getQuestRewardStatus(this._questId, rewardId);
                    let fmt = this.settings(key);
                    fmt = resolveCachedText(runtime, fmt, [getCacheType()]);
                    let rawRewardText = JSON.parse(lineData[rewardId]);
                    rawRewardText = resolveCachedText(runtime, rawRewardText, [getCacheType()]);
                    text += fmt.format(rawRewardText);
                }
                return text;
            };
            klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_GET_REWARDS_HOOKED__ = true;
        }

        if (
            typeof klass.prototype.drawEmpty === 'function' &&
            !klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_DRAW_EMPTY_HOOKED__
        ) {
            klass.prototype.drawEmpty = function () {
                let fmt = Window_QuestData._questNoDataFmt;
                fmt = resolveCachedText(getRuntime(), fmt, [getCacheType()]);
                const wordwrap = fmt.match(/<(?:WordWrap)>/i);
                const text = fmt.format();
                const textState = { index: 0 };
                textState.originalText = text;
                textState.text = this.convertEscapeCharacters(text);
                this.resetFontSettings();
                this._allTextHeight = this.calcTextHeight(textState, true);
                this._allTextHeight *= wordwrap ? 10 : 1;
                this.createContents();
                this.drawQuestTextEx(text, 0, 0);
            };
            klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_DRAW_EMPTY_HOOKED__ = true;
        }

        if (
            typeof klass.prototype.drawQuestData === 'function' &&
            !klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_DRAW_DATA_HOOKED__
        ) {
            klass.prototype.drawQuestData = function () {
                Window_QuestData._questDataFmt = JSON.parse(
                    Yanfly.Param.QuestDataWindow['Quest Data Format'] || ''
                );
                const questData = $dataQuests[this._questId];
                if (!questData) return;
                const runtime = getRuntime();
                let fmt = Window_QuestData._questDataFmt;
                fmt = resolveCachedText(runtime, fmt, [getCacheType()]);
                const wordwrap = fmt.match(/<(?:WordWrap)>/i);
                let title = questData.name;
                title = title.replaceAll(/\\I\[\d+\]/gi, '').trim();
                title = title.replaceAll(/\\C\[\d+\]/gi, '').trim();
                title = resolveCachedText(runtime, title, [COMMAND_CACHE_TYPE]);
                const difficulty = resolveCachedText(runtime, questData.difficulty, [
                    getCacheType(),
                ]);
                const from = resolveCachedText(runtime, questData.from, [getCacheType()]);
                const location = resolveCachedText(runtime, questData.location, [getCacheType()]);
                const description = this.getQuestDescription();
                const objectives = this.getQuestObjectives(wordwrap);
                const rewards = this.getQuestRewards(wordwrap);
                const subtext = this.getQuestSubtext();
                const text = fmt.format(
                    title,
                    difficulty,
                    from,
                    location,
                    description,
                    objectives,
                    rewards,
                    subtext
                );
                const textState = { index: 0 };
                textState.originalText = text;
                textState.text = this.convertEscapeCharacters(text);
                this.resetFontSettings();
                this._allTextHeight = this.calcTextHeight(textState, true);
                this._allTextHeight *= wordwrap ? 10 : 1;
                this.createContents();
                this.drawQuestTextEx(text, 0, 0);
            };
            klass.prototype.__CHEAT_YEP_QUEST_JOURNAL_DRAW_DATA_HOOKED__ = true;
        }
    }

    installMenuCommandHook() {
        const klass = window.Window_MenuCommand;
        const guardKey = '__CHEAT_YEP_QUEST_JOURNAL_MENU_COMMAND_HOOKED__';

        if (!klass?.prototype || typeof klass.prototype.addQuestCommand !== 'function') {
            return;
        }

        if (klass.prototype[guardKey]) {
            return;
        }

        const translateCommandListEntries = this.translateCommandListEntries.bind(this);
        const original = klass.prototype.addQuestCommand;
        klass.prototype.addQuestCommand = function () {
            const result = original.apply(this, arguments);
            translateCommandListEntries(this);
            return result;
        };

        klass.prototype[guardKey] = true;
    }

    enablePluginTranslation() {
        this.installCommandListHook(
            window.Window_QuestCategories,
            '__CHEAT_YEP_QUEST_JOURNAL_CATEGORY_COMMAND_LIST_HOOKED__'
        );
        this.installCommandListHook(
            window.Window_QuestList,
            '__CHEAT_YEP_QUEST_JOURNAL_LIST_COMMAND_LIST_HOOKED__'
        );
        this.installQuestTitleHook();
        this.installQuestDataHooks();
        this.installMenuCommandHook();
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheType = this.isUsableText(entry.cacheType) ? entry.cacheType : this.getCacheType();
            const cacheKey = runtime.getCacheKey(text, cacheType);

            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_yep_quest_journal_${cacheType}_${byCacheKey.size}`,
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

    countPluginAmountSync({ runtime }) {
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
