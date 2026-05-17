import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_QUEST_SYSTEM_TRANSLATOR_HOOKED__';

const QUEST_DATA_TEXT_FIELDS = ['Title', 'Requester', 'Difficulty', 'Place', 'TimeLimit'];

const QUEST_DETAIL_FIELDS = [
    {
        noteField: 'DetailNote',
        legacyField: 'Detail',
        outputField: 'Detail',
    },
    {
        noteField: 'HiddenDetailNote',
        legacyField: 'HiddenDetail',
        outputField: 'HiddenDetail',
    },
];

const TEXT_COMMAND_FIELDS = new Set([
    'MenuQuestSystemText',
    'AllCommandText',
    'QuestOrderCommandText',
    'OrderingQuestCommandText',
    'QuestCancelCommandText',
    'QuestReportCommandText',
    'ReportedQuestCommandText',
    'FailedQuestCommandText',
    'ExpiredQuestCommandText',
    'HiddenQuestCommandText',
]);

function resolveQuestDetailText(noteValue, legacyValue) {
    const noteText = parseJsonSafely(noteValue, noteValue);
    if (typeof noteText === 'string' && noteText.trim() !== '') {
        return noteText;
    }

    const legacyText = parseJsonSafely(legacyValue, legacyValue);
    if (typeof legacyText === 'string' && legacyText.trim() !== '') {
        return legacyText;
    }

    return '';
}

export class QuestSystemTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getCtorName(instance) {
        if (!instance || typeof instance !== 'object') {
            return '(unknown)';
        }

        if (instance.constructor && typeof instance.constructor.name === 'string') {
            return instance.constructor.name;
        }

        return '(anonymous-ctor)';
    }

    isQuestSceneActive() {
        const scene = window.SceneManager ? SceneManager._scene : null;
        const sceneCtorName = this.getCtorName(scene);
        return sceneCtorName === 'Scene_QuestSystem';
    }

    shouldTranslateWindow(instance) {
        const ctorName = this.getCtorName(instance);
        if (ctorName.startsWith('Window_Quest')) {
            return true;
        }

        // Safety fallback: only while QuestSystem scene is active.
        return this.isQuestSceneActive() && ctorName.startsWith('Window_');
    }

    formatPreview(text) {
        if (typeof text !== 'string') {
            return String(text);
        }

        return text.replaceAll('\n', String.raw`\n`).slice(0, 120);
    }

    getPluginName() {
        return 'QuestSystem';
    }

    getPluginLabel() {
        return 'QuestSystem';
    }

    getCacheType() {
        return 'plugin_quest_system';
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

    appendTextStructEntries(rawTextStruct, scope, output) {
        const parsed = parseJsonSafely(rawTextStruct, null);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return;
        }

        for (const [field, value] of Object.entries(parsed)) {
            if (!this.isUsableText(value)) {
                continue;
            }

            output.push({
                text: value,
                source: {
                    scope,
                    group: 'Text',
                    field,
                },
            });

            if (TEXT_COMMAND_FIELDS.has(field)) {
                output.push({
                    text: value,
                    cacheType: 'command',
                    source: {
                        scope,
                        group: 'Text',
                        field,
                        mirrorType: 'command',
                    },
                });
            }
        }
    }

    appendRewardEntries(rawRewards, scope, output) {
        const parsedRewards = parseJsonSafely(rawRewards, []);
        if (!Array.isArray(parsedRewards)) {
            return;
        }

        for (let rewardIndex = 0; rewardIndex < parsedRewards.length; rewardIndex++) {
            const rewardRaw = parsedRewards[rewardIndex];
            const reward =
                typeof rewardRaw === 'string'
                    ? parseJsonSafely(rewardRaw, null)
                    : rewardRaw || null;

            if (!reward || typeof reward !== 'object' || Array.isArray(reward)) {
                continue;
            }

            const rewardText = reward.Text;
            if (!this.isUsableText(rewardText)) {
                continue;
            }

            output.push({
                text: rewardText,
                source: {
                    ...scope,
                    group: 'QuestDatas',
                    field: 'Rewards.Text',
                    rewardIndex,
                },
            });
        }
    }

    appendQuestDetailEntries(quest, scope, questIndex, output) {
        for (const detailField of QUEST_DETAIL_FIELDS) {
            const detailText = resolveQuestDetailText(
                quest[detailField.noteField],
                quest[detailField.legacyField]
            );
            if (!this.isUsableText(detailText)) {
                continue;
            }

            output.push({
                text: detailText,
                source: {
                    ...scope,
                    group: 'QuestDatas',
                    questIndex,
                    field: detailField.outputField,
                    noteField: detailField.noteField,
                    legacyField: detailField.legacyField,
                },
            });
        }
    }

    appendQuestDataEntries(rawQuestDatas, scope, output) {
        const parsedQuestDatas = parseJsonSafely(rawQuestDatas, []);
        if (!Array.isArray(parsedQuestDatas)) {
            return;
        }

        for (let questIndex = 0; questIndex < parsedQuestDatas.length; questIndex++) {
            const questRaw = parsedQuestDatas[questIndex];
            const quest =
                typeof questRaw === 'string' ? parseJsonSafely(questRaw, null) : questRaw || null;

            if (!quest || typeof quest !== 'object' || Array.isArray(quest)) {
                continue;
            }

            for (const field of QUEST_DATA_TEXT_FIELDS) {
                const value = quest[field];
                if (!this.isUsableText(value)) {
                    continue;
                }

                output.push({
                    text: value,
                    source: {
                        ...scope,
                        group: 'QuestDatas',
                        questIndex,
                        field,
                    },
                });

                if (field === 'Title') {
                    output.push({
                        text: value,
                        cacheType: 'command',
                        source: {
                            ...scope,
                            group: 'QuestDatas',
                            questIndex,
                            field,
                            mirrorType: 'command',
                        },
                    });
                }
            }

            this.appendQuestDetailEntries(quest, scope, questIndex, output);

            this.appendRewardEntries(quest.Rewards, { ...scope, questIndex }, output);
        }
    }

    appendEntriesFromParameters(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object' || !Array.isArray(output)) {
            return;
        }

        this.appendTextStructEntries(parameters.Text, scope, output);
        this.appendQuestDataEntries(parameters.QuestDatas, scope, output);
    }

    normalizeCacheTypes(cacheTypes) {
        const list = Array.isArray(cacheTypes) ? cacheTypes : [this.getCacheType()];
        return list.filter((cacheType) => this.isUsableText(cacheType));
    }

    tryGetCachedTextForType(text, runtime, cacheType) {
        const cacheKey = runtime.getCacheKey(text, cacheType);

        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return null;
        }

        const cached = runtime.translationCache.get(cacheKey);

        return this.isUsableText(cached) ? cached : text;
    }

    translateRuntimeText(text, runtime, cacheTypes = [this.getCacheType()]) {
        if (!this.isUsableText(text)) {
            return text;
        }

        if (!runtime) {
            return text;
        }

        if (!this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        const normalizedTypes = this.normalizeCacheTypes(cacheTypes);
        for (const cacheType of normalizedTypes) {
            const cachedText = this.tryGetCachedTextForType(text, runtime, cacheType);
            if (cachedText != null) {
                return cachedText;
            }
        }

        return text;
    }

    isQuestWindowInstance(instance) {
        if (!instance || typeof instance !== 'object') {
            return false;
        }

        const ctorName =
            instance.constructor && typeof instance.constructor.name === 'string'
                ? instance.constructor.name
                : '';

        return ctorName.startsWith('Window_Quest');
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return true;
        }

        const translateRuntimeText = (text, runtime, cacheTypes) =>
            this.translateRuntimeText(text, runtime, cacheTypes);
        const pluginCacheType = this.getCacheType();
        const getCtorName = (instance) => this.getCtorName(instance);
        const shouldTranslateWindow = (instance) => this.shouldTranslateWindow(instance);
        const formatPreview = (text) => this.formatPreview(text);
        const getRuntime = () => this.getRuntime();
        const translateWithRuntime = (value) => {
            const runtime = getRuntime();
            return translateRuntimeText(value, runtime);
        };
        const getQuestClass = (className) => {
            if (window[className]) {
                return window[className];
            }

            const aliasObj = window.QuestSystemAlias;
            if (aliasObj?.[className]) {
                return aliasObj[className];
            }

            return null;
        };
        const installQuestCommandListHook = (className) => {
            const klass = getQuestClass(className);
            if (!klass?.prototype || typeof klass.prototype.makeCommandList !== 'function') {
                return;
            }

            const guardKey = `__CHEAT_QUEST_SYSTEM_${className}_MAKE_COMMAND_LIST_HOOKED__`;
            if (klass.prototype[guardKey]) {
                return;
            }

            const originalMakeCommandList = klass.prototype.makeCommandList;
            klass.prototype.makeCommandList = function () {
                const result = originalMakeCommandList.apply(this, arguments);

                try {
                    if (!Array.isArray(this._list)) {
                        return result;
                    }

                    for (const item of this._list) {
                        if (!item || typeof item.name !== 'string' || !item.name.trim()) {
                            continue;
                        }

                        const translated = translateRuntimeText(item.name, getRuntime(), [
                            'command',
                            pluginCacheType,
                        ]);
                        if (translated !== item.name) {
                            console.log(
                                '[QuestSystemTranslator][debug] command list entry translated',
                                {
                                    className,
                                    original: item.name,
                                    translated,
                                }
                            );
                            item.name = translated;
                        }
                    }
                } catch (error) {
                    console.warn(
                        `[QuestSystemTranslator] Failed to translate ${className}.makeCommandList entries`,
                        error
                    );
                }

                return result;
            };

            klass.prototype[guardKey] = true;
        };
        const installQuestStateTextHook = () => {
            const questDataClass = window.QuestSystemAlias?.QuestData;
            if (
                !questDataClass?.prototype ||
                typeof questDataClass.prototype.stateText !== 'function'
            ) {
                return;
            }

            const guardKey = '__CHEAT_QUEST_SYSTEM_QUESTDATA_STATE_TEXT_HOOKED__';
            if (questDataClass.prototype[guardKey]) {
                return;
            }

            const originalStateText = questDataClass.prototype.stateText;
            questDataClass.prototype.stateText = function () {
                const original = originalStateText.apply(this, arguments);
                try {
                    return translateWithRuntime(original);
                } catch (error) {
                    console.warn(
                        '[QuestSystemTranslator] Failed to translate QuestData.stateText()',
                        error
                    );
                    return original;
                }
            };

            questDataClass.prototype[guardKey] = true;
        };
        const installQuestWindowMethodDrawTextHook = (className, methodName) => {
            const klass = getQuestClass(className);
            if (!klass?.prototype || typeof klass.prototype[methodName] !== 'function') {
                return;
            }

            const guardKey = `__CHEAT_QUEST_SYSTEM_${className}_${methodName}_DRAW_TEXT_HOOKED__`;
            if (klass.prototype[guardKey]) {
                return;
            }

            const originalMethod = klass.prototype[methodName];
            klass.prototype[methodName] = function () {
                const originalDrawText = this.drawText;
                if (typeof originalDrawText !== 'function') {
                    return originalMethod.apply(this, arguments);
                }

                this.drawText = function (text, x, y, maxWidth, align) {
                    try {
                        const translated = translateRuntimeText(text, getRuntime(), [
                            pluginCacheType,
                            'command',
                        ]);
                        return originalDrawText.call(this, translated, x, y, maxWidth, align);
                    } catch (error) {
                        console.warn(
                            `[QuestSystemTranslator] Failed in ${className}.${methodName} drawText shim`,
                            error
                        );
                        return originalDrawText.call(this, text, x, y, maxWidth, align);
                    }
                };

                try {
                    return originalMethod.apply(this, arguments);
                } finally {
                    this.drawText = originalDrawText;
                }
            };

            klass.prototype[guardKey] = true;
        };
        const installQuestUiHooks = () => {
            installQuestWindowMethodDrawTextHook('Window_QuestDetail', 'drawTitle');
            installQuestWindowMethodDrawTextHook('Window_QuestDetail', 'drawRequester');
            installQuestWindowMethodDrawTextHook('Window_QuestDetail', 'drawRewards');
            installQuestWindowMethodDrawTextHook('Window_QuestDetail', 'drawDifficulty');
            installQuestWindowMethodDrawTextHook('Window_QuestDetail', 'drawPlace');
            installQuestWindowMethodDrawTextHook('Window_QuestDetail', 'drawTimeLimit');
            installQuestWindowMethodDrawTextHook('Window_QuestOrder', 'drawAllItems');
            installQuestWindowMethodDrawTextHook('Window_QuestCancel', 'drawAllItems');
            installQuestWindowMethodDrawTextHook('Window_QuestReport', 'drawAllItems');
            installQuestWindowMethodDrawTextHook('Window_QuestOrderFailed', 'drawAllItems');
            installQuestWindowMethodDrawTextHook('Window_QuestGetReward', 'drawAllItems');
        };
        const ensureQuestSpecificHooks = () => {
            installQuestCommandListHook('Window_QuestCommand');
            installQuestCommandListHook('Window_QuestList');
            installQuestStateTextHook();
            installQuestUiHooks();
        };

        const canHookDrawText =
            !!window.Window_Base &&
            !!Window_Base.prototype &&
            typeof Window_Base.prototype.drawText === 'function';
        const canHookDrawTextEx =
            !!window.Window_Base &&
            !!Window_Base.prototype &&
            typeof Window_Base.prototype.drawTextEx === 'function';
        const canHookCreateTextState =
            !!window.Window_Base &&
            !!Window_Base.prototype &&
            typeof Window_Base.prototype.createTextState === 'function';
        const canHookBitmapDrawText =
            !!window.Bitmap &&
            !!Bitmap.prototype &&
            typeof Bitmap.prototype.drawText === 'function';
        const canHookMenuCommands =
            !!window.Window_MenuCommand &&
            !!Window_MenuCommand.prototype &&
            typeof Window_MenuCommand.prototype.addOriginalCommands === 'function';

        if (
            !canHookDrawText &&
            !canHookDrawTextEx &&
            !canHookCreateTextState &&
            !canHookBitmapDrawText &&
            !canHookMenuCommands
        ) {
            return false;
        }

        if (canHookDrawText) {
            const originalDrawText = Window_Base.prototype.drawText;

            Window_Base.prototype.drawText = function (text, x, y, maxWidth, align) {
                let translatedText = text;

                try {
                    if (!shouldTranslateWindow(this)) {
                        return originalDrawText.call(this, text, x, y, maxWidth, align);
                    }

                    ensureQuestSpecificHooks();

                    const ctorName = getCtorName(this);
                    const runtime = getRuntime();
                    translatedText = translateRuntimeText(text, runtime, [
                        pluginCacheType,
                        'command',
                    ]);
                    if (translatedText !== text) {
                        console.log('[QuestSystemTranslator][debug] drawText translated', {
                            ctorName,
                            original: String(text)
                                .replaceAll('\n', String.raw`\n`)
                                .slice(0, 120),
                            translated: String(translatedText)
                                .replaceAll('\n', String.raw`\n`)
                                .slice(0, 120),
                        });
                    }
                } catch (error) {
                    console.warn(
                        '[QuestSystemTranslator] Failed to apply quest runtime translation in drawText',
                        error
                    );
                }

                return originalDrawText.call(this, translatedText, x, y, maxWidth, align);
            };
        }

        if (canHookDrawTextEx) {
            const originalDrawTextEx = Window_Base.prototype.drawTextEx;

            Window_Base.prototype.drawTextEx = function (text, x, y, width) {
                let translatedText = text;

                try {
                    if (!shouldTranslateWindow(this)) {
                        return originalDrawTextEx.call(this, text, x, y, width);
                    }

                    ensureQuestSpecificHooks();

                    const ctorName = getCtorName(this);
                    const runtime = getRuntime();
                    translatedText = translateRuntimeText(text, runtime, [
                        pluginCacheType,
                        'command',
                    ]);
                    if (translatedText !== text) {
                        console.log('[QuestSystemTranslator][debug] drawTextEx translated', {
                            ctorName,
                            original: String(text)
                                .replaceAll('\n', String.raw`\n`)
                                .slice(0, 120),
                            translated: String(translatedText)
                                .replaceAll('\n', String.raw`\n`)
                                .slice(0, 120),
                        });
                    }
                } catch (error) {
                    console.warn(
                        '[QuestSystemTranslator] Failed to apply quest runtime translation in drawTextEx',
                        error
                    );
                }

                return originalDrawTextEx.call(this, translatedText, x, y, width);
            };
        }

        if (canHookCreateTextState) {
            const originalCreateTextState = Window_Base.prototype.createTextState;

            Window_Base.prototype.createTextState = function (text, x, y, width) {
                let translatedText = text;

                try {
                    if (shouldTranslateWindow(this)) {
                        ensureQuestSpecificHooks();
                        const runtime = getRuntime();
                        translatedText = translateRuntimeText(text, runtime, [
                            pluginCacheType,
                            'command',
                        ]);
                        if (translatedText !== text) {
                            console.log(
                                '[QuestSystemTranslator][debug] createTextState translated',
                                {
                                    ctorName: getCtorName(this),
                                    original: formatPreview(text),
                                    translated: formatPreview(translatedText),
                                }
                            );
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[QuestSystemTranslator] Failed to apply quest runtime translation in createTextState',
                        error
                    );
                }

                return originalCreateTextState.call(this, translatedText, x, y, width);
            };
        }

        if (canHookBitmapDrawText) {
            const originalBitmapDrawText = Bitmap.prototype.drawText;

            Bitmap.prototype.drawText = function (text, x, y, maxWidth, lineHeight, align) {
                let translatedText = text;

                try {
                    const scene = window.SceneManager ? SceneManager._scene : null;
                    const sceneCtorName = getCtorName(scene);
                    if (sceneCtorName === 'Scene_QuestSystem') {
                        const runtime = getRuntime();
                        translatedText = translateRuntimeText(text, runtime, [
                            pluginCacheType,
                            'command',
                        ]);
                        if (translatedText !== text) {
                            console.log(
                                '[QuestSystemTranslator][debug] Bitmap.drawText translated',
                                {
                                    original: formatPreview(text),
                                    translated: formatPreview(translatedText),
                                }
                            );
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[QuestSystemTranslator] Failed to apply quest runtime translation in Bitmap.drawText',
                        error
                    );
                }

                return originalBitmapDrawText.call(
                    this,
                    translatedText,
                    x,
                    y,
                    maxWidth,
                    lineHeight,
                    align
                );
            };
        }

        if (canHookMenuCommands) {
            const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;

            Window_MenuCommand.prototype.addOriginalCommands = function () {
                const result = originalAddOriginalCommands.apply(this, arguments);

                try {
                    const runtime = getRuntime();
                    if (Array.isArray(this._list)) {
                        for (const command of this._list) {
                            if (command?.symbol !== 'quest') {
                                continue;
                            }

                            const translated = translateRuntimeText(command.name, runtime, [
                                'command',
                                pluginCacheType,
                            ]);
                            if (translated !== command.name) {
                                console.log(
                                    '[QuestSystemTranslator][debug] menu command translated',
                                    {
                                        original: String(command.name),
                                        translated: String(translated),
                                    }
                                );
                                command.name = translated;
                            }
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[QuestSystemTranslator] Failed to apply quest menu command translation',
                        error
                    );
                }

                return result;
            };
        }

        ensureQuestSpecificHooks();

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

        this._scanPromise = Promise.resolve(this.buildScanEntries())
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[QuestSystemTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.appendEntriesFromParameters(
                pluginEntry.parameters,
                'pluginEntryParameter',
                entries
            );
        }

        if (window.PluginManager && typeof PluginManager.parameters === 'function') {
            const runtimeParameters = PluginManager.parameters(this.getPluginName());
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

            const cacheType = this.isUsableText(entry.cacheType)
                ? entry.cacheType
                : this.getCacheType();
            const cacheKey = runtime.getCacheKey(text, cacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_quest_system_${cacheType}_${byCacheKey.size}`,
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
