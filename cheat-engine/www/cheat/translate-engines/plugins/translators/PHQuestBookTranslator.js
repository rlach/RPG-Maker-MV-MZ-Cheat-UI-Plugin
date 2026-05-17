import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * PH_QuestBook plugin translator.
 *
 * Supported versions:
 * - PH_QuestBook.js v2.0.0 (MV)
 *
 * Notes:
 * - Quest definitions are parsed from the Common Event named "PHQuestBook".
 * - Header format: {Quest Title|categoryId|iconId}; only title text is extracted.
 * - Description blocks may contain [break-on-update], which is stripped from translatable text.
 * - Runtime translation is applied only in Scene_QuestBook window draw paths.
 */

const QUEST_BOOK_COMMON_EVENT_NAME = 'PHQuestBook';
const BREAK_ON_UPDATE_TAG = '[break-on-update]';

const QUEST_BOOK_TEXT_PARAMETER_FIELDS = [
    'Name in Menu',
    'Text Title',
    'Text Default Quest',
    'Text No Quests',
];

const QUEST_BOOK_CATEGORY_TEXT_PARAMETER = 'Category Texts';

const QUEST_BOOK_DRAW_TEXT_WINDOW_NAMES = new Set([
    'Window_QuestBookTitle',
    'Window_QuestBookCategory',
    'Window_QuestBookList',
]);

const QUEST_BOOK_DETAILS_WINDOW_NAME = 'Window_QuestBookDetails';

function getCtorName(instance) {
    if (!instance || typeof instance !== 'object') {
        return '';
    }

    const ctor = instance.constructor;
    if (!ctor || typeof ctor.name !== 'string') {
        return '';
    }

    return ctor.name;
}

export class PHQuestBookTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'PH_QuestBook';
    }

    getPluginLabel() {
        return 'PH Quest Book';
    }

    getCacheType() {
        return 'plugin_ph_quest_book';
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
        if (window.PluginManager && typeof PluginManager.parameters === 'function') {
            return PluginManager.parameters(this.getPluginName()) || null;
        }

        return null;
    }

    getPluginParameters() {
        const pluginEntry = this.findPluginEntry();
        const entryParams = pluginEntry?.parameters;
        if (entryParams && typeof entryParams === 'object') {
            return entryParams;
        }

        return this.getRuntimeParameters();
    }

    isQuestBookSceneActive() {
        const scene = window.SceneManager ? SceneManager._scene : null;
        return getCtorName(scene) === 'Scene_QuestBook';
    }

    isDrawTextTargetWindow(windowInstance) {
        return QUEST_BOOK_DRAW_TEXT_WINDOW_NAMES.has(getCtorName(windowInstance));
    }

    isDetailsTargetWindow(windowInstance) {
        return getCtorName(windowInstance) === QUEST_BOOK_DETAILS_WINDOW_NAME;
    }

    translateQuestBookText(text, runtime) {
        return this.resolveRuntimeTranslation(text, runtime, [
            this.getCacheType(),
            'command',
            'message',
        ]);
    }

    enablePluginTranslation() {
        if (!window.Window_Base || !Window_Base.prototype) {
            return false;
        }

        if (
            typeof Window_Base.prototype.drawText !== 'function' ||
            typeof Window_Base.prototype.convertEscapeCharacters !== 'function'
        ) {
            return false;
        }

        const originalDrawText = Window_Base.prototype.drawText;
        const isQuestBookSceneActive = this.isQuestBookSceneActive.bind(this);
        const isDrawTextTargetWindow = this.isDrawTextTargetWindow.bind(this);
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const translateQuestBookText = this.translateQuestBookText.bind(this);
        Window_Base.prototype.drawText = function () {
            try {
                if (isQuestBookSceneActive() && isDrawTextTargetWindow(this)) {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime)) {
                        arguments[0] = translateQuestBookText(arguments[0], runtime);
                    }
                }
            } catch (error) {
                console.warn(
                    '[PHQuestBookTranslator] Failed to apply quest book drawText translation',
                    error
                );
            }

            return originalDrawText.apply(this, arguments);
        };

        const originalConvertEscapeCharacters = Window_Base.prototype.convertEscapeCharacters;
        const isDetailsTargetWindow = this.isDetailsTargetWindow.bind(this);
        Window_Base.prototype.convertEscapeCharacters = function (text) {
            try {
                if (isQuestBookSceneActive() && isDetailsTargetWindow(this)) {
                    const runtime = getRuntime();
                    if (isRuntimeTranslationActive(runtime)) {
                        text = translateQuestBookText(text, runtime);
                    }
                }
            } catch (error) {
                console.warn(
                    '[PHQuestBookTranslator] Failed to apply quest book detail translation',
                    error
                );
            }

            return originalConvertEscapeCharacters.call(this, text);
        };

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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[PHQuestBookTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    appendTextEntry(output, text, source, cacheType = this.getCacheType()) {
        if (!Array.isArray(output) || !this.isUsableText(text)) {
            return;
        }

        output.push({
            text,
            cacheType,
            source,
        });
    }

    appendParameterEntries(output) {
        const parameters = this.getPluginParameters();
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        for (const field of QUEST_BOOK_TEXT_PARAMETER_FIELDS) {
            const value = parameters[field];
            if (!this.isUsableText(value)) {
                continue;
            }

            this.appendTextEntry(output, value, {
                scope: 'pluginParameter',
                field,
            });

            if (field === 'Name in Menu') {
                this.appendTextEntry(
                    output,
                    value,
                    {
                        scope: 'pluginParameter',
                        field,
                        mirrorType: 'command',
                    },
                    'command'
                );
            }
        }

        const categoryTextsRaw = parameters[QUEST_BOOK_CATEGORY_TEXT_PARAMETER];
        if (!this.isUsableText(categoryTextsRaw)) {
            return;
        }

        const categoryTexts = String(categoryTextsRaw)
            .split(',')
            .map((text) => String(text || '').trim())
            .filter((text) => this.isUsableText(text));

        for (let index = 0; index < categoryTexts.length; index++) {
            const text = categoryTexts[index];
            this.appendTextEntry(output, text, {
                scope: 'pluginParameter',
                field: QUEST_BOOK_CATEGORY_TEXT_PARAMETER,
                index,
            });
        }
    }

    findQuestBookCommonEvent() {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return null;
        }

        for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
            const commonEvent = $dataCommonEvents[commonEventId];
            if (!commonEvent || typeof commonEvent !== 'object') {
                continue;
            }

            if (String(commonEvent.name || '') !== QUEST_BOOK_COMMON_EVENT_NAME) {
                continue;
            }

            if (!Array.isArray(commonEvent.list)) {
                return null;
            }

            return {
                commonEventId,
                list: commonEvent.list,
            };
        }

        return null;
    }

    parseQuestHeader(line) {
        const safeLine = String(line || '').trim();
        if (!safeLine.startsWith('{') || !safeLine.endsWith('}')) {
            return null;
        }

        const inner = safeLine.slice(1, -1).trim();
        if (!this.isUsableText(inner)) {
            return null;
        }

        const parts = inner.split('|');
        const title = String(parts[0] || '').trim();
        if (!this.isUsableText(title)) {
            return null;
        }

        return {
            title,
        };
    }

    extractCommandLineText(command) {
        if (!command || !Array.isArray(command.parameters)) {
            return '';
        }

        if (command.parameters.length === 0 || command.parameters[0] === undefined) {
            return '';
        }

        return String(command.parameters[0] || '').trim();
    }

    normalizeDescriptionLine(line) {
        return String(line || '').replaceAll(BREAK_ON_UPDATE_TAG, '').trim();
    }

    appendQuestCommonEventEntries(output) {
        const commonEvent = this.findQuestBookCommonEvent();
        if (!commonEvent) {
            return;
        }

        let questIndex = -1;

        for (let cmdIdx = 0; cmdIdx < commonEvent.list.length; cmdIdx++) {
            const command = commonEvent.list[cmdIdx];
            const line = this.extractCommandLineText(command);
            if (!this.isUsableText(line)) {
                continue;
            }

            const header = this.parseQuestHeader(line);
            if (header) {
                questIndex += 1;

                this.appendTextEntry(output, header.title, {
                    scope: 'commonEvent',
                    commonEventId: commonEvent.commonEventId,
                    cmdIdx,
                    questIndex,
                    field: 'title',
                });

                this.appendTextEntry(
                    output,
                    header.title,
                    {
                        scope: 'commonEvent',
                        commonEventId: commonEvent.commonEventId,
                        cmdIdx,
                        questIndex,
                        field: 'title',
                        mirrorType: 'command',
                    },
                    'command'
                );

                continue;
            }

            if (questIndex < 0) {
                continue;
            }

            const descriptionLine = this.normalizeDescriptionLine(line);
            if (!this.isUsableText(descriptionLine)) {
                continue;
            }

            this.appendTextEntry(output, descriptionLine, {
                scope: 'commonEvent',
                commonEventId: commonEvent.commonEventId,
                cmdIdx,
                questIndex,
                field: 'description',
            });
        }
    }

    async buildScanEntries() {
        const entries = [];
        this.appendParameterEntries(entries);
        this.appendQuestCommonEventEntries(entries);
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
                    id: `plugin_ph_quest_book_${byCacheKey.size}`,
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