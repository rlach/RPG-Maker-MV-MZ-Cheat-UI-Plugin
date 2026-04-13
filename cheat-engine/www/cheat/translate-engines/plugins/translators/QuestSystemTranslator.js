import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_QUEST_SYSTEM_TRANSLATOR_HOOKED__';

const QUEST_DATA_TEXT_FIELDS = [
    'Title',
    'Requester',
    'Difficulty',
    'Place',
    'TimeLimit',
    'Detail',
    'HiddenDetail',
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

function isUsableText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function parseJsonSafely(value, fallback) {
    if (typeof value !== 'string') {
        return value ?? fallback;
    }

    const normalized = value.trim();
    if (!normalized) {
        return fallback;
    }

    try {
        return JSON.parse(normalized);
    } catch {
        return fallback;
    }
}

function getRuntime() {
    return typeof window.__ensureTranslationRuntime === 'function'
        ? window.__ensureTranslationRuntime()
        : window.__TranslationRuntime || null;
}

export class QuestSystemTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._debugLogCount = 0;
        this._debugLogLimit = 500;
        this._debugSuppressedNoticeShown = false;
        this._debugSeenHitKeys = new Set();
        this._debugSeenMissKeys = new Set();
        this._debugSeenDrawTextCtors = new Set();
        this._debugSeenDrawTextExCtors = new Set();
        this._debugInstalledLogged = false;
    }

    isDebugEnabled() {
        return window.__CHEAT_DEBUG_QUEST_SYSTEM_TRANSLATOR !== false;
    }

    debugLog(...args) {
        if (!this.isDebugEnabled()) {
            return;
        }

        if (this._debugLogCount >= this._debugLogLimit) {
            if (!this._debugSuppressedNoticeShown) {
                this._debugSuppressedNoticeShown = true;
                console.log('[QuestSystemTranslator][debug] log limit reached; suppressing further logs');
            }
            return;
        }

        this._debugLogCount += 1;
        console.log('[QuestSystemTranslator][debug]', ...args);
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

        const pluginName = String(this.getPluginName() || '').trim().toLowerCase();
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
            if (!isUsableText(value)) {
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
                typeof rewardRaw === 'string' ? parseJsonSafely(rewardRaw, null) : rewardRaw || null;

            if (!reward || typeof reward !== 'object' || Array.isArray(reward)) {
                continue;
            }

            const rewardText = reward.Text;
            if (!isUsableText(rewardText)) {
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

    appendQuestDataEntries(rawQuestDatas, scope, output) {
        const parsedQuestDatas = parseJsonSafely(rawQuestDatas, []);
        if (!Array.isArray(parsedQuestDatas)) {
            return;
        }

        for (let questIndex = 0; questIndex < parsedQuestDatas.length; questIndex++) {
            const questRaw = parsedQuestDatas[questIndex];
            const quest = typeof questRaw === 'string' ? parseJsonSafely(questRaw, null) : questRaw || null;

            if (!quest || typeof quest !== 'object' || Array.isArray(quest)) {
                continue;
            }

            for (const field of QUEST_DATA_TEXT_FIELDS) {
                const value = quest[field];
                if (!isUsableText(value)) {
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
        return list.filter((cacheType) => isUsableText(cacheType));
    }

    tryGetCachedTextForType(text, runtime, cacheType) {
        const cacheKey = runtime.getCacheKey(text, cacheType);

        if (typeof runtime.markCacheKeySeen === 'function') {
            runtime.markCacheKeySeen(cacheKey);
        }

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            if (!this._debugSeenMissKeys.has(cacheKey)) {
                this._debugSeenMissKeys.add(cacheKey);
                this.debugLog('cache miss', {
                    cacheType,
                    cacheKey,
                    existsInMap: runtime.translationCache.has(cacheKey),
                    text: this.formatPreview(text),
                });
            }

            return null;
        }

        const cached = runtime.translationCache.get(cacheKey);
        if (!this._debugSeenHitKeys.has(cacheKey)) {
            this._debugSeenHitKeys.add(cacheKey);
            this.debugLog('cache hit', {
                cacheType,
                cacheKey,
                original: this.formatPreview(text),
                translated: this.formatPreview(cached),
            });
        }

        return isUsableText(cached) ? cached : text;
    }

    translateRuntimeText(text, runtime, cacheTypes = [this.getCacheType()]) {
        if (!isUsableText(text)) {
            return text;
        }

        if (
            !runtime ||
            typeof runtime.getCacheKey !== 'function' ||
            typeof runtime.hasUsableCacheValue !== 'function' ||
            !(runtime.translationCache instanceof Map)
        ) {
            this.debugLog('runtime unavailable or incompatible', {
                hasRuntime: !!runtime,
                hasGetCacheKey: !!runtime && typeof runtime.getCacheKey === 'function',
                hasHasUsable: !!runtime && typeof runtime.hasUsableCacheValue === 'function',
                hasCacheMap: !!runtime && runtime.translationCache instanceof Map,
                text: this.formatPreview(text),
            });
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
            this.debugLog('hook install skipped; already installed');
            return;
        }

        const translateRuntimeText = (text, runtime, cacheTypes) =>
            this.translateRuntimeText(text, runtime, cacheTypes);
        const pluginCacheType = this.getCacheType();
        const getCtorName = (instance) => this.getCtorName(instance);
        const shouldTranslateWindow = (instance) => this.shouldTranslateWindow(instance);
        const formatPreview = (text) => this.formatPreview(text);
        const logDrawTextCtor = (instance) => {
            const ctorName = getCtorName(instance);
            if (this._debugSeenDrawTextCtors.has(ctorName)) {
                return;
            }

            this._debugSeenDrawTextCtors.add(ctorName);
            this.debugLog('drawText caller detected', { ctorName });
        };
        const logDrawTextExCtor = (instance) => {
            const ctorName = getCtorName(instance);
            if (this._debugSeenDrawTextExCtors.has(ctorName)) {
                return;
            }

            this._debugSeenDrawTextExCtors.add(ctorName);
            this.debugLog('drawTextEx caller detected', { ctorName });
        };
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
                            console.log('[QuestSystemTranslator][debug] command list entry translated', {
                                className,
                                original: item.name,
                                translated,
                            });
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
            this.debugLog('installed makeCommandList hook', { className });
        };
        const installQuestStateTextHook = () => {
            const questDataClass = window.QuestSystemAlias?.QuestData;
            if (!questDataClass?.prototype || typeof questDataClass.prototype.stateText !== 'function') {
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
                    console.warn('[QuestSystemTranslator] Failed to translate QuestData.stateText()', error);
                    return original;
                }
            };

            questDataClass.prototype[guardKey] = true;
            this.debugLog('installed QuestData.stateText hook');
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
            this.debugLog('installed method drawText hook', { className, methodName });
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

        if (!this._debugInstalledLogged) {
            this._debugInstalledLogged = true;
            this.debugLog('installing hooks', {
                hasWindowBase: !!window.Window_Base,
                hasDrawText: !!window.Window_Base?.prototype?.drawText,
                hasDrawTextEx: !!window.Window_Base?.prototype?.drawTextEx,
                hasMenuCommand: !!window.Window_MenuCommand?.prototype?.addOriginalCommands,
            });
        }

        if (
            window.Window_Base &&
            Window_Base.prototype &&
            typeof Window_Base.prototype.drawText === 'function'
        ) {
            const originalDrawText = Window_Base.prototype.drawText;

            Window_Base.prototype.drawText = function (text, x, y, maxWidth, align) {
                let translatedText = text;

                try {
                    if (!shouldTranslateWindow(this)) {
                        return originalDrawText.call(this, text, x, y, maxWidth, align);
                    }

                    ensureQuestSpecificHooks();

                    const ctorName = getCtorName(this);
                    logDrawTextCtor(this);
                    const runtime = getRuntime();
                    translatedText = translateRuntimeText(text, runtime, [
                        pluginCacheType,
                        'command',
                    ]);
                    if (translatedText !== text) {
                        console.log('[QuestSystemTranslator][debug] drawText translated', {
                            ctorName,
                            original: String(text).replaceAll('\n', String.raw`\n`).slice(0, 120),
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

        if (
            window.Window_Base &&
            Window_Base.prototype &&
            typeof Window_Base.prototype.drawTextEx === 'function'
        ) {
            const originalDrawTextEx = Window_Base.prototype.drawTextEx;

            Window_Base.prototype.drawTextEx = function (text, x, y, width) {
                let translatedText = text;

                try {
                    if (!shouldTranslateWindow(this)) {
                        return originalDrawTextEx.call(this, text, x, y, width);
                    }

                    ensureQuestSpecificHooks();

                    const ctorName = getCtorName(this);
                    logDrawTextExCtor(this);
                    const runtime = getRuntime();
                    translatedText = translateRuntimeText(text, runtime, [
                        pluginCacheType,
                        'command',
                    ]);
                    if (translatedText !== text) {
                        console.log('[QuestSystemTranslator][debug] drawTextEx translated', {
                            ctorName,
                            original: String(text).replaceAll('\n', String.raw`\n`).slice(0, 120),
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

        if (
            window.Window_Base &&
            Window_Base.prototype &&
            typeof Window_Base.prototype.createTextState === 'function'
        ) {
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
                            console.log('[QuestSystemTranslator][debug] createTextState translated', {
                                ctorName: getCtorName(this),
                                original: formatPreview(text),
                                translated: formatPreview(translatedText),
                            });
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

        if (window.Bitmap && Bitmap.prototype && typeof Bitmap.prototype.drawText === 'function') {
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
                            console.log('[QuestSystemTranslator][debug] Bitmap.drawText translated', {
                                original: formatPreview(text),
                                translated: formatPreview(translatedText),
                            });
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

        if (
            window.Window_MenuCommand &&
            Window_MenuCommand.prototype &&
            typeof Window_MenuCommand.prototype.addOriginalCommands === 'function'
        ) {
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
                                console.log('[QuestSystemTranslator][debug] menu command translated', {
                                    original: String(command.name),
                                    translated: String(translated),
                                });
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
        this.debugLog('hooks installed', { guard: RUNTIME_HOOK_GUARD });
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
            this.appendEntriesFromParameters(pluginEntry.parameters, 'pluginEntryParameter', entries);
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

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!isUsableText(text)) {
                continue;
            }

            const cacheType = isUsableText(entry.cacheType) ? entry.cacheType : this.getCacheType();
            const cacheKey = panel.getCacheKey(text, cacheType);
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

    collectUntranslated({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(panel);
        const totalStrings = items.length;
        const leftStrings = items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey)).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}