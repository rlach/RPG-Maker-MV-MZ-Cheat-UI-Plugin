import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_TORIGOYA_ACHIEVEMENT_TRANSLATOR_HOOKED__';

const PARAMETER_TEXT_FIELDS = [
    'Popup Message',
    'Menu Text',
    'List Hidden Title',
    'List Hidden Description',
    'List Cancel Message',
];

const ACHIEVEMENT_TEXT_FIELDS = ['title', 'description', 'secretTitle', 'secretDescription'];

export class TorigoyaAchievementTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'Torigoya_Achievement';
    }

    getPluginLabel() {
        return 'Torigoya Achievement (MV)';
    }

    getCacheType() {
        return 'plugin_torigoya_achievement_mv';
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

    appendTextEntry(output, text, source) {
        const normalized = typeof text === 'string' ? text : '';
        if (!normalized.trim()) {
            return;
        }

        output.push({
            text: normalized,
            source,
        });
    }

    parseCommonEventIdFromPluginParameters(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return 0;
        }

        return Number(parameters['Common Event ID'] || 0) || 0;
    }

    parseCommonEventIdFromRuntimeSettings(settings) {
        if (!settings || typeof settings !== 'object') {
            return 0;
        }

        return Number(settings.commonEventID || 0) || 0;
    }

    extractAchievementBlocksFromCommonEventList(list) {
        if (!Array.isArray(list)) {
            return [];
        }

        const result = [];
        let isRouting = false;

        for (let i = 0; i < list.length; i++) {
            const command = list[i];
            const code = Number(command && command.code);
            const firstParameter =
                Array.isArray(command && command.parameters) &&
                typeof command.parameters[0] === 'string'
                    ? command.parameters[0]
                    : '';

            if (isRouting && code === 408) {
                result[result.length - 1].push(firstParameter);
            } else if (code === 108 && firstParameter.indexOf('id:') === 0) {
                result.push([firstParameter]);
                isRouting = true;
            } else {
                isRouting = false;
            }
        }

        return result;
    }

    parseAchievementItemFromCommentBlock(lines) {
        const item = {
            id: 0,
            icon: 0,
            title: '',
            description: '',
            isSecret: false,
            secretTitle: '',
            secretDescription: '',
        };

        if (!Array.isArray(lines)) {
            return item;
        }

        for (const line of lines) {
            const safeLine = String(line || '');

            let match = safeLine.match(/^\s*id:\s*(\d+)/);
            if (!item.id && match) {
                item.id = Number(match[1]) || 0;
                continue;
            }

            match = safeLine.match(/^\s*icon:\s*(\d+)/);
            if (!item.icon && match) {
                item.icon = Number(match[1]) || 0;
                continue;
            }

            match = safeLine.match(/^\s*title:\s*(.+)\s*$/);
            if (!item.title && match) {
                item.title = match[1];
                continue;
            }

            match = safeLine.match(/^\s*secret:\s*(.+)\s*$/);
            if (match) {
                item.isSecret = match[1] === 'true';
                continue;
            }

            match = safeLine.match(/^\s*secretTitle:\s*(.+)\s*$/);
            if (match) {
                item.secretTitle = match[1];
                continue;
            }

            match = safeLine.match(/^\s*secretText:\s*(.+)\s*$/);
            if (match) {
                item.secretDescription = match[1];
                continue;
            }

            item.description += `${safeLine}\n`;
        }

        return item;
    }

    mergeAchievementItems(items) {
        const merged = [];

        for (const item of items) {
            if (!item || !item.id) {
                continue;
            }

            const previous = merged.find((entry) => entry.id === item.id);
            if (!previous) {
                merged.push({ ...item });
                continue;
            }

            for (const key of Object.keys(item)) {
                if (!item[key]) {
                    continue;
                }
                previous[key] = item[key];
            }
        }

        return merged.sort((a, b) => a.id - b.id);
    }

    parseAchievementsFromCommonEvent(commonEventId) {
        const safeCommonEventId = Number(commonEventId) || 0;
        if (safeCommonEventId <= 0 || !Array.isArray(window.$dataCommonEvents)) {
            return [];
        }

        const event = window.$dataCommonEvents[safeCommonEventId];
        if (!event || !Array.isArray(event.list)) {
            return [];
        }

        const blocks = this.extractAchievementBlocksFromCommonEventList(event.list);
        const parsedItems = blocks.map((block) => this.parseAchievementItemFromCommentBlock(block));
        return this.mergeAchievementItems(parsedItems);
    }

    appendEntriesFromPluginParameters(parameters, output) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        for (const field of PARAMETER_TEXT_FIELDS) {
            this.appendTextEntry(output, parameters[field], {
                scope: 'pluginParameter',
                field,
            });
        }

        const commonEventId = this.parseCommonEventIdFromPluginParameters(parameters);
        const achievements = this.parseAchievementsFromCommonEvent(commonEventId);
        for (let i = 0; i < achievements.length; i++) {
            const achievement = achievements[i];
            for (const field of ACHIEVEMENT_TEXT_FIELDS) {
                this.appendTextEntry(output, achievement[field], {
                    scope: 'commonEventAchievement',
                    commonEventId,
                    achievementId: Number(achievement.id) || 0,
                    achievementIndex: i,
                    field,
                });
            }
        }
    }

    appendEntriesFromRuntimeSettings(settings, output) {
        if (!settings || typeof settings !== 'object') {
            return;
        }

        this.appendTextEntry(output, settings.popupMessage, {
            scope: 'runtimeSettings',
            field: 'popupMessage',
        });
        this.appendTextEntry(output, settings.menuText, {
            scope: 'runtimeSettings',
            field: 'menuText',
        });
        this.appendTextEntry(output, settings.listHiddenTitle, {
            scope: 'runtimeSettings',
            field: 'listHiddenTitle',
        });
        this.appendTextEntry(output, settings.listHiddenDescription, {
            scope: 'runtimeSettings',
            field: 'listHiddenDescription',
        });
        this.appendTextEntry(output, settings.listCancel, {
            scope: 'runtimeSettings',
            field: 'listCancel',
        });

        const commonEventId = this.parseCommonEventIdFromRuntimeSettings(settings);
        const achievements = this.parseAchievementsFromCommonEvent(commonEventId);
        for (let i = 0; i < achievements.length; i++) {
            const achievement = achievements[i];
            for (const field of ACHIEVEMENT_TEXT_FIELDS) {
                this.appendTextEntry(output, achievement[field], {
                    scope: 'runtimeCommonEventAchievement',
                    commonEventId,
                    achievementId: Number(achievement.id) || 0,
                    achievementIndex: i,
                    field,
                });
            }
        }
    }

    appendEntriesFromAchievementItems(items, output, scope, commonEventId = 0) {
        if (!Array.isArray(items) || !Array.isArray(output)) {
            return;
        }

        for (let i = 0; i < items.length; i++) {
            const achievement = items[i];
            if (!achievement || typeof achievement !== 'object') {
                continue;
            }

            for (const field of ACHIEVEMENT_TEXT_FIELDS) {
                this.appendTextEntry(output, achievement[field], {
                    scope,
                    commonEventId,
                    achievementId: Number(achievement.id) || 0,
                    achievementIndex: i,
                    field,
                });
            }
        }
    }

    appendEntriesFromRuntimeManager(output) {
        const namespace = window.Torigoya && window.Torigoya.Achievement;
        const manager = namespace && namespace.Manager;

        if (!manager || typeof manager.allData !== 'function') {
            return;
        }

        const runtimeItems = manager.allData();
        this.appendEntriesFromAchievementItems(
            Array.isArray(runtimeItems) ? runtimeItems : [],
            output,
            'runtimeManagerAchievement',
            0
        );
    }

    mergeEntriesByText(entries) {
        if (!Array.isArray(entries)) {
            return [];
        }

        const merged = [];
        const seenTexts = new Set();

        for (const entry of entries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            const normalized = text.trim();
            if (!normalized) {
                continue;
            }

            if (seenTexts.has(text)) {
                continue;
            }

            seenTexts.add(text);
            merged.push(entry);
        }

        return merged;
    }

    refreshRuntimeEntriesIfNeeded() {
        const runtimeEntries = [];
        this.appendEntriesFromRuntimeManager(runtimeEntries);
        if (runtimeEntries.length <= 0) {
            return;
        }

        this._scanEntries = this.mergeEntriesByText([
            ...(Array.isArray(this._scanEntries) ? this._scanEntries : []),
            ...runtimeEntries,
        ]);
    }

    translateRuntimeText(text, runtime) {
        if (!runtime) {
            return text;
        }

        if (typeof text !== 'string' || !text.trim()) {
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, this.getCacheType());

        runtime.trackCacheKeyUsage(cacheKey);

        if (
            !runtime.hasUsableCacheValue(cacheKey)
        ) {
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        if (typeof cached !== 'string' || !cached.trim()) {
            return text;
        }

        return cached;
    }

    postprocessDescriptionText(text, runtime) {
        if (typeof text !== 'string' || !text) {
            return text;
        }

        if (!runtime) {
            return text;
        }

        const cleaned = runtime.cleanTranslatedText(text);

        const maxWidth = Number(runtime.descriptionMaxLineWidth || runtime.maxLineWidth || 0) || 0;

        return runtime.wrapText(cleaned, maxWidth, {
            flattenExistingNewlines: true,
        });
    }

    translateAchievementCommandName(commandWindow, runtime) {
        if (!commandWindow || !Array.isArray(commandWindow._list)) {
            return;
        }

        for (const command of commandWindow._list) {
            if (!command || command.symbol !== 'achievement') {
                continue;
            }

            if (typeof command.name !== 'string' || !command.name.trim()) {
                continue;
            }

            command.name = this.translateRuntimeText(command.name, runtime);
        }
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return true;
        }

        const namespace = window.Torigoya && window.Torigoya.Achievement;
        if (!namespace || !namespace.settings) {
            return false;
        }

        const translator = this;

        const popupWindowClass = namespace.Window_AchievementPopup;
        if (
            popupWindowClass &&
            popupWindowClass.prototype &&
            typeof popupWindowClass.prototype.drawTitle === 'function'
        ) {
            popupWindowClass.prototype.drawTitle = function () {
                const runtime = translator.getRuntime();
                const title = translator.translateRuntimeText(
                    this.item && typeof this.item.title === 'string' ? this.item.title : '',
                    runtime
                );
                this.drawTextEx(`\\c[1]${title}`, 50, 5);
            };
        }

        if (
            popupWindowClass &&
            popupWindowClass.prototype &&
            typeof popupWindowClass.prototype.drawMessage === 'function'
        ) {
            popupWindowClass.prototype.drawMessage = function () {
                const textWidth = this.windowWidth() - 60;
                const runtime = translator.getRuntime();
                const message = translator.translateRuntimeText(
                    namespace.settings.popupMessage,
                    runtime
                );

                this.resetTextColor();
                this.contents.fontSize = 12;
                this.contents.drawText(message, 50, 29, textWidth, 12, 'left');
            };
        }

        const listWindowClass = namespace.Window_AchievementList;
        if (
            listWindowClass &&
            listWindowClass.prototype &&
            typeof listWindowClass.prototype.drawItem === 'function'
        ) {
            listWindowClass.prototype.drawItem = function (index) {
                const item = this._data[index];
                const rect = this.itemRect(index);
                const iconBoxWidth = Window_Base._iconWidth + 4;
                const runtime = translator.getRuntime();

                if (item) {
                    this.changePaintOpacity(item.unlocked);
                    this.drawIcon(item.icon, rect.x, rect.y);
                    this.drawText(
                        translator.translateRuntimeText(item.title, runtime),
                        rect.x + iconBoxWidth,
                        rect.y,
                        rect.width - iconBoxWidth,
                        'left'
                    );
                    this.changePaintOpacity(true);
                } else {
                    this.changePaintOpacity(true);
                    this.drawText(
                        translator.translateRuntimeText(namespace.settings.listCancel, runtime),
                        rect.x,
                        rect.y,
                        rect.width,
                        'center'
                    );
                }
            };
        }

        if (
            listWindowClass &&
            listWindowClass.prototype &&
            typeof listWindowClass.prototype.updateHelp === 'function'
        ) {
            listWindowClass.prototype.updateHelp = function () {
                this._helpWindow.clear();

                const item = this.item();
                if (!item) {
                    this.setHelpWindowItem(null);
                    return;
                }

                const runtime = translator.getRuntime();
                this.setHelpWindowItem({
                    ...item,
                    description: translator.postprocessDescriptionText(
                        translator.translateRuntimeText(item.description, runtime),
                        runtime
                    ),
                    title: translator.translateRuntimeText(item.title, runtime),
                });
            };
        }

        if (
            window.Window_TitleCommand &&
            Window_TitleCommand.prototype &&
            typeof Window_TitleCommand.prototype.makeCommandList === 'function'
        ) {
            const originalMakeCommandList = Window_TitleCommand.prototype.makeCommandList;
            Window_TitleCommand.prototype.makeCommandList = function () {
                const result = originalMakeCommandList.apply(this, arguments);
                translator.translateAchievementCommandName(this, translator.getRuntime());
                return result;
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
                translator.translateAchievementCommandName(this, translator.getRuntime());
                return result;
            };
        }

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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[TorigoyaAchievementTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        const pluginParameters =
            pluginEntry && pluginEntry.parameters && typeof pluginEntry.parameters === 'object'
                ? pluginEntry.parameters
                : null;

        if (pluginParameters) {
            this.appendEntriesFromPluginParameters(pluginParameters, entries);
        }

        if (entries.length <= 0) {
            const runtimeSettings =
                window.Torigoya &&
                window.Torigoya.Achievement &&
                window.Torigoya.Achievement.settings;
            this.appendEntriesFromRuntimeSettings(runtimeSettings, entries);
        }

        this.appendEntriesFromRuntimeManager(entries);

        return this.mergeEntriesByText(entries);
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_torigoya_achievement_mv_${byCacheKey.size}`,
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

        this.refreshRuntimeEntriesIfNeeded();

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        this.refreshRuntimeEntriesIfNeeded();

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
