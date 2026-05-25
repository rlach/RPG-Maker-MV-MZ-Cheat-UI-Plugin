import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * LL_GalgeChoiceWindow translator.
 *
 * Supported plugin versions:
 * - LL_GalgeChoiceWindow.js v1.0.5 (MZ)
 * - LL_GalgeChoiceWindow.js v2.0.1 (MZ)
 * - LL_GalgeChoiceWindowMV.js v1.0.3 (MV)
 *
 * Notes:
 * - MZ: Extracts text from plugin command "showChoice" args:
 *   - messageText (multi-line)
 *   - choices (JSON array of struct JSON strings, using each struct.label)
 * - MV: Reconstructs displayed text from plugin-command flow:
 *   - setMessageText / setChoices state before showChoice
 * - Runtime hooks patch the plugin's custom UI drawing flow
 *   (Window_GalgeChoiceList#setQuestionText / #drawItem), with support for:
 *   - v2.x Scene_Message#createGalgeChoiceListWindow path
 *   - v1.x Scene_GalgeChoice#createChoiceWindow path (via SceneManager.push hook)
 *   so translation and seen-tracking happen at the actual display point.
 */

const LL_GALGE_PLUGIN_NAME = 'll_galgechoicewindow';
const LL_GALGE_PLUGIN_NAME_MV = 'll_galgechoicewindowmv';
const LL_GALGE_SHOW_CHOICE_COMMAND = 'showChoice';
const LL_GALGE_SET_MESSAGE_COMMAND = 'setMessageText';
const LL_GALGE_SET_CHOICES_COMMAND = 'setChoices';

function splitMvPluginCommandLine(commandLine) {
    const normalized = String(commandLine || '').trim();
    if (!normalized) {
        return { pluginName: '', subCommand: '', tail: '' };
    }

    const [pluginName = '', subCommand = '', ...tailParts] = normalized.split(/\s+/);
    return {
        pluginName,
        subCommand,
        tail: tailParts.join(' '),
    };
}

function toLowerSafe(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function splitMessageTextLines(rawText) {
    return String(rawText || '').split('\n');
}

export class LLGalgeChoiceWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'LL_GalgeChoiceWindow';
    }

    getPluginAliases() {
        return ['LL_GalgeChoiceWindow', 'LL_GalgeChoiceWindowMV'];
    }

    getPluginLabel() {
        return 'LL GalgeChoiceWindow';
    }

    getCacheType() {
        return 'plugin_ll_galge_choice_window';
    }

    enablePluginTranslation() {
        if (!this.installEarlyWindowCommandHook() || !this.installLegacyScenePushHooks()) {
            return false;
        }

        const sceneMessageProto = window.Scene_Message?.prototype;
        const canInstallSceneMessageHook =
            sceneMessageProto && typeof sceneMessageProto.createGalgeChoiceListWindow === 'function';
        if (canInstallSceneMessageHook && !this.installSceneMessageHooks()) {
            return false;
        }

        try {
            const currentScene = SceneManager?._scene;
            if (currentScene?._galgeChoiceListWindow) {
                this.installGalgeWindowHooks(currentScene._galgeChoiceListWindow);
            }

            if (currentScene?._choiceWindow) {
                this.installGalgeWindowHooks(currentScene._choiceWindow);
            }
        } catch (error) {
            console.warn(
                '[LLGalgeChoiceWindowTranslator] Failed to install hooks for current galge scene window',
                error
            );
        }
        return true;
    }

    installSceneMessageHooks() {
        const SceneMessageClass = window.Scene_Message;
        if (
            !SceneMessageClass?.prototype ||
            typeof SceneMessageClass.prototype.createGalgeChoiceListWindow !== 'function'
        ) {
            return false;
        }

        const installWindowHooks = this.installGalgeWindowHooks.bind(this);
        const originalCreateGalgeChoiceListWindow =
            SceneMessageClass.prototype.createGalgeChoiceListWindow;

        SceneMessageClass.prototype.createGalgeChoiceListWindow = function () {
            const result = originalCreateGalgeChoiceListWindow.apply(this, arguments);

            try {
                installWindowHooks(this._galgeChoiceListWindow);
            } catch (error) {
                console.warn(
                    '[LLGalgeChoiceWindowTranslator] Failed to install runtime hooks on galge choice window',
                    error
                );
            }

            return result;
        };
        return true;
    }

    installEarlyWindowCommandHook() {
        if (
            !Window_Command?.prototype ||
            typeof Window_Command.prototype.initialize !== 'function'
        ) {
            return false;
        }

        const commandProto = Window_Command.prototype;
        if (commandProto.__CHEAT_LL_GALGE_WINDOW_COMMAND_INIT_HOOKED__) {
            return true;
        }

        const installGalgeWindowHooks = this.installGalgeWindowHooks.bind(this);
        const isLikelyGalgeChoiceWindow = this.isLikelyGalgeChoiceWindow.bind(this);
        const originalInitialize = commandProto.initialize;

        commandProto.initialize = function () {
            const shouldHookEarly = isLikelyGalgeChoiceWindow(this);

            if (shouldHookEarly) {
                installGalgeWindowHooks(this);
            }

            const result = originalInitialize.apply(this, arguments);

            try {
                if (shouldHookEarly) {
                    installGalgeWindowHooks(this);
                }
            } catch (error) {
                console.warn(
                    '[LLGalgeChoiceWindowTranslator] Failed to install early galge hooks from Window_Command.initialize',
                    error
                );
            }

            return result;
        };

        Object.defineProperty(commandProto, '__CHEAT_LL_GALGE_WINDOW_COMMAND_INIT_HOOKED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
        return true;
    }

    isLikelyGalgeChoiceWindow(windowInstance) {
        if (!windowInstance) {
            return false;
        }

        const constructorName = String(windowInstance.constructor?.name || '').trim();
        if (constructorName === 'Window_GalgeChoiceList') {
            return true;
        }

        return (
            typeof windowInstance.setQuestionText === 'function' &&
            typeof windowInstance.drawItem === 'function' &&
            typeof windowInstance.makeCommandList === 'function' &&
            typeof windowInstance.processCancel === 'function'
        );
    }

    installLegacyScenePushHooks() {
        if (!SceneManager || typeof SceneManager.push !== 'function') {
            return false;
        }

        if (SceneManager.__CHEAT_LL_GALGE_SCENE_PUSH_HOOKED__) {
            return true;
        }

        const installLegacySceneHooks = this.installLegacySceneHooks.bind(this);
        const originalPush = SceneManager.push;

        SceneManager.push = function () {
            const sceneClass = arguments[0];

            // Patch scene prototype before push, so the first opened dialog in a fresh session
            // already goes through translated UI drawing hooks.
            installLegacySceneHooks(sceneClass);

            const result = originalPush.apply(this, arguments);

            return result;
        };

        Object.defineProperty(SceneManager, '__CHEAT_LL_GALGE_SCENE_PUSH_HOOKED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
        return true;
    }

    installLegacySceneHooks(sceneClass) {
        if (typeof sceneClass !== 'function' || !sceneClass.prototype) {
            return;
        }

        const sceneName = String(sceneClass.name || '').trim();
        const sceneProto = sceneClass.prototype;
        const hasChoiceWindowCreator = typeof sceneProto.createChoiceWindow === 'function';
        const createsGalgeChoiceWindow = hasChoiceWindowCreator
            ? /Window_GalgeChoiceList/.test(String(sceneProto.createChoiceWindow))
            : false;

        if (sceneName !== 'Scene_GalgeChoice' && !createsGalgeChoiceWindow) {
            return;
        }

        if (sceneProto.__CHEAT_LL_GALGE_LEGACY_SCENE_HOOKED__) {
            return;
        }

        if (typeof sceneProto.createChoiceWindow === 'function') {
            const installWindowHooks = this.installGalgeWindowHooks.bind(this);
            const originalCreateChoiceWindow = sceneProto.createChoiceWindow;

            sceneProto.createChoiceWindow = function () {
                const result = originalCreateChoiceWindow.apply(this, arguments);

                try {
                    installWindowHooks(this._choiceWindow);
                } catch (error) {
                    console.warn(
                        '[LLGalgeChoiceWindowTranslator] Failed to install hooks on legacy _choiceWindow',
                        error
                    );
                }

                return result;
            };
        }

        Object.defineProperty(sceneProto, '__CHEAT_LL_GALGE_LEGACY_SCENE_HOOKED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    installGalgeWindowHooks(galgeChoiceWindow) {
        if (!galgeChoiceWindow) {
            return;
        }

        const windowProto = Object.getPrototypeOf(galgeChoiceWindow);
        if (!windowProto || windowProto.__CHEAT_LL_GALGE_CHOICE_WINDOW_HOOKED__) {
            return;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        if (typeof windowProto.setQuestionText === 'function') {
            const originalSetQuestionText = windowProto.setQuestionText;
            windowProto.setQuestionText = function () {
                const runtime = getRuntime();
                if (!runtime || !isRuntimeTranslationActive(runtime) || !this.drawText) {
                    return originalSetQuestionText.apply(this, arguments);
                }

                const originalDrawText = this.drawText;
                this.drawText = function (text, x, y, maxWidth, align) {
                    const translatedText = resolveRuntimeTranslation(
                        text,
                        runtime,
                        'plugin_ll_galge_choice_window',
                        { requireRuntimeTranslationActive: true }
                    );
                    return Reflect.apply(originalDrawText, this, [
                        translatedText,
                        x,
                        y,
                        maxWidth,
                        align,
                    ]);
                };

                try {
                    return originalSetQuestionText.apply(this, arguments);
                } finally {
                    this.drawText = originalDrawText;
                }
            };
        }

        if (typeof windowProto.drawItem === 'function') {
            const originalDrawItem = windowProto.drawItem;
            windowProto.drawItem = function () {
                const runtime = getRuntime();
                if (!runtime || !isRuntimeTranslationActive(runtime) || !this.commandName) {
                    return originalDrawItem.apply(this, arguments);
                }

                const originalCommandName = this.commandName;
                this.commandName = function (index) {
                    const commandText = Reflect.apply(originalCommandName, this, [index]);
                    const translatedText = resolveRuntimeTranslation(
                        commandText,
                        runtime,
                        'plugin_ll_galge_choice_window',
                        { requireRuntimeTranslationActive: true }
                    );
                    return translatedText;
                };

                try {
                    return originalDrawItem.apply(this, arguments);
                } finally {
                    this.commandName = originalCommandName;
                }
            };
        }

        Object.defineProperty(windowProto, '__CHEAT_LL_GALGE_CHOICE_WINDOW_HOOKED__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });
    }

    isGalgeShowChoiceCommand(parameters) {
        const params = Array.isArray(parameters) ? parameters : [];
        const pluginName = toLowerSafe(params[0]);
        const commandName = String(params[1] || '').trim();
        return (
            (pluginName === LL_GALGE_PLUGIN_NAME || pluginName === LL_GALGE_PLUGIN_NAME_MV) &&
            commandName === LL_GALGE_SHOW_CHOICE_COMMAND
        );
    }

    isMvGalgePluginCommand(pluginName) {
        const normalizedPluginName = toLowerSafe(pluginName);
        return (
            normalizedPluginName === LL_GALGE_PLUGIN_NAME ||
            normalizedPluginName === LL_GALGE_PLUGIN_NAME_MV
        );
    }

    applyMvCommandToState(parsedCommand, state) {
        if (parsedCommand.subCommand === LL_GALGE_SET_MESSAGE_COMMAND) {
            state.messageText = parsedCommand.tail;
            return false;
        }

        if (parsedCommand.subCommand === LL_GALGE_SET_CHOICES_COMMAND) {
            state.choices = parsedCommand.tail
                .split(',')
                .map((choice) => String(choice || '').trim())
                .filter((choice) => this.isUsableText(choice));
            return false;
        }

        return parsedCommand.subCommand === LL_GALGE_SHOW_CHOICE_COMMAND;
    }

    buildMvShowChoiceEntry(state) {
        const messageLines = splitMessageTextLines(state.messageText).filter((line) =>
            this.isUsableText(line)
        );
        const choiceLabels = state.choices.slice();

        if (messageLines.length === 0 && choiceLabels.length === 0) {
            return null;
        }

        return {
            messageLines,
            choiceLabels,
        };
    }

    extractShowChoiceEntryFromMvList(list, showChoiceIdx) {
        if (!Array.isArray(list)) {
            return null;
        }

        const showChoiceCommand = list[showChoiceIdx];
        if (!showChoiceCommand || Number(showChoiceCommand.code) !== 356) {
            return null;
        }

        const showChoiceCommandLine = Array.isArray(showChoiceCommand.parameters)
            ? showChoiceCommand.parameters[0]
            : '';
        const showChoiceParsed = splitMvPluginCommandLine(showChoiceCommandLine);
        if (
            !this.isMvGalgePluginCommand(showChoiceParsed.pluginName) ||
            showChoiceParsed.subCommand !== LL_GALGE_SHOW_CHOICE_COMMAND
        ) {
            return null;
        }

        const state = {
            messageText: '',
            choices: [],
        };

        for (let cmdIdx = 0; cmdIdx <= showChoiceIdx; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 356) {
                continue;
            }

            const commandLine = Array.isArray(cmd.parameters) ? cmd.parameters[0] : '';
            const parsed = splitMvPluginCommandLine(commandLine);
            if (!this.isMvGalgePluginCommand(parsed.pluginName)) {
                continue;
            }

            this.applyMvCommandToState(parsed, state);
        }

        return this.buildMvShowChoiceEntry(state);
    }

    translateShowChoiceArgs(args, runtime) {
        if (!args || typeof args !== 'object') {
            return args;
        }

        let changed = false;
        const nextArgs = { ...args };

        const translatedMessageText = this.translateMessageTextBlock(args.messageText, runtime);
        if (translatedMessageText !== args.messageText) {
            nextArgs.messageText = translatedMessageText;
            changed = true;
        }

        const translatedChoices = this.translateChoicesPayload(args.choices, runtime);
        if (translatedChoices !== args.choices) {
            nextArgs.choices = translatedChoices;
            changed = true;
        }

        return changed ? nextArgs : args;
    }

    translateMessageTextBlock(rawMessageText, runtime) {
        if (!this.isUsableText(rawMessageText)) {
            return rawMessageText;
        }

        const lines = splitMessageTextLines(rawMessageText);
        let changed = false;
        const translatedLines = lines.map((line) => {
            const translatedLine = this.resolveRuntimeTranslation(
                line,
                runtime,
                this.getCacheType(),
                { requireRuntimeTranslationActive: true }
            );
            if (translatedLine !== line) {
                changed = true;
            }

            return translatedLine;
        });

        if (!changed) {
            return rawMessageText;
        }

        return translatedLines.join('\n');
    }

    translateChoicesPayload(rawChoices, runtime) {
        if (typeof rawChoices !== 'string' || !rawChoices.trim()) {
            return rawChoices;
        }

        const parsedChoices = parseJsonSafely(rawChoices, []);
        if (!Array.isArray(parsedChoices)) {
            return rawChoices;
        }

        let changed = false;
        const translatedChoices = parsedChoices.map((rawChoice) => {
            const choice = parseJsonSafely(rawChoice, null);
            if (!choice || typeof choice !== 'object') {
                return rawChoice;
            }

            const originalLabel = typeof choice.label === 'string' ? choice.label : '';
            const translatedLabel = this.resolveRuntimeTranslation(
                originalLabel,
                runtime,
                this.getCacheType(),
                { requireRuntimeTranslationActive: true }
            );
            if (translatedLabel === originalLabel) {
                return rawChoice;
            }

            changed = true;
            const translatedChoice = {
                ...choice,
                label: translatedLabel,
            };

            return JSON.stringify(translatedChoice);
        });

        if (!changed) {
            return rawChoices;
        }

        return JSON.stringify(translatedChoices);
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
                console.warn('[LLGalgeChoiceWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        this.scanCommonEvents(entries);
        this.scanTroopEvents(entries);
        await this.scanMapEvents(entries);

        return entries;
    }

    scanCommonEvents(entries) {
        const commonEvents = Array.isArray(window.$dataCommonEvents)
            ? window.$dataCommonEvents
            : [];
        for (let commonEventId = 0; commonEventId < commonEvents.length; commonEventId++) {
            const commonEvent = commonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectShowChoiceTextsFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                entries
            );
        }
    }

    scanTroopEvents(entries) {
        const troops = Array.isArray(window.$dataTroops) ? window.$dataTroops : [];
        for (let troopId = 0; troopId < troops.length; troopId++) {
            const troop = troops[troopId];
            if (!troop || !Array.isArray(troop.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < troop.pages.length; pageIdx++) {
                const page = troop.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectShowChoiceTextsFromList(
                    page.list,
                    {
                        scope: 'troopEvent',
                        troopId,
                        pageIdx,
                    },
                    entries
                );
            }
        }
    }

    async scanMapEvents(entries) {
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                this.scanMapDataEvents(mapData, mapId, entries);
            } catch (error) {
                console.warn(`[LLGalgeChoiceWindowTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    scanMapDataEvents(mapData, mapId, entries) {
        if (!mapData || !Array.isArray(mapData.events)) {
            return;
        }

        for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
            const event = mapData.events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                const page = event.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectShowChoiceTextsFromList(
                    page.list,
                    {
                        scope: 'mapEvent',
                        mapId,
                        eventIdx,
                        pageIdx,
                    },
                    entries
                );
            }
        }
    }

    collectShowChoiceTextsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const entry = this.extractShowChoiceEntry(cmd) || this.extractShowChoiceEntryFromMvList(list, cmdIdx);
            if (!entry) {
                continue;
            }

            for (let lineIdx = 0; lineIdx < entry.messageLines.length; lineIdx++) {
                output.push({
                    text: entry.messageLines[lineIdx],
                    source: {
                        ...baseMeta,
                        cmdIdx,
                        kind: 'messageText',
                        lineIdx,
                    },
                });
            }

            for (let choiceIdx = 0; choiceIdx < entry.choiceLabels.length; choiceIdx++) {
                output.push({
                    text: entry.choiceLabels[choiceIdx],
                    source: {
                        ...baseMeta,
                        cmdIdx,
                        kind: 'choiceLabel',
                        choiceIdx,
                    },
                });
            }
        }
    }

    extractShowChoiceEntry(cmd) {
        if (!cmd || Number(cmd.code) !== 357) {
            return null;
        }

        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        if (!this.isGalgeShowChoiceCommand(parameters)) {
            return null;
        }

        const args = parameters[3] && typeof parameters[3] === 'object' ? parameters[3] : null;
        if (!args) {
            return null;
        }

        const messageLines = splitMessageTextLines(args.messageText).filter((line) =>
            this.isUsableText(line)
        );
        const choiceLabels = this.extractChoiceLabels(args.choices);

        if (messageLines.length === 0 && choiceLabels.length === 0) {
            return null;
        }

        return {
            messageLines,
            choiceLabels,
        };
    }

    extractChoiceLabels(rawChoices) {
        const labels = [];
        const parsedChoices = parseJsonSafely(rawChoices, []);
        if (!Array.isArray(parsedChoices)) {
            return labels;
        }

        for (const rawChoice of parsedChoices) {
            const parsedChoice = parseJsonSafely(rawChoice, null);
            if (!parsedChoice || typeof parsedChoice !== 'object') {
                continue;
            }

            const label = typeof parsedChoice.label === 'string' ? parsedChoice.label : '';
            if (this.isUsableText(label)) {
                labels.push(label);
            }
        }

        return labels;
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
                    id: `plugin_ll_galge_choice_window_${byCacheKey.size}`,
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
