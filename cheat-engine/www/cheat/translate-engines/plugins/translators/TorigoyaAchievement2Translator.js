import { BasePluginTranslator } from '../BasePluginTranslator.js';

const ACHIEVEMENT_TEXT_FIELDS = ['title', 'description', 'hint'];
const PARAMETER_TEXT_FIELDS = ['popupMessage', 'titleMenuText', 'achievementMenuHiddenTitle'];

function parseJsonSafely(value, fallback) {
    if (typeof value !== 'string') {
        return value ?? fallback;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

export class TorigoyaAchievement2Translator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'TorigoyaMZ_Achievement2';
    }

    getPluginLabel() {
        return 'Torigoya Achievement2';
    }

    getCacheType() {
        return 'plugin_torigoya_achievement2';
    }

    getRuntime() {
        return typeof window.__ensureTranslationRuntime === 'function'
            ? window.__ensureTranslationRuntime()
            : window.__TranslationRuntime || null;
    }

    translateRuntimeText(text, runtime) {
        if (!runtime || typeof runtime.getCacheKey !== 'function') {
            return text;
        }

        if (typeof text !== 'string' || !text.trim()) {
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, this.getCacheType());

        if (typeof runtime.markCacheKeySeen === 'function') {
            runtime.markCacheKeySeen(cacheKey);
        }

        if (
            !(runtime.translationCache instanceof Map) ||
            typeof runtime.hasUsableCacheValue !== 'function' ||
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

    parseAchievementParameterArray(rawValue) {
        const parsed = parseJsonSafely(rawValue, []);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((entry) => parseJsonSafely(entry, null))
            .filter((entry) => entry && typeof entry === 'object');
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

        const achievements = this.parseAchievementParameterArray(parameters.baseAchievementData);

        for (let achievementIndex = 0; achievementIndex < achievements.length; achievementIndex++) {
            const achievement = achievements[achievementIndex];
            if (!achievement || typeof achievement !== 'object') {
                continue;
            }

            for (const field of ACHIEVEMENT_TEXT_FIELDS) {
                this.appendTextEntry(output, achievement[field], {
                    scope: 'pluginParameterAchievement',
                    achievementIndex,
                    field,
                    key: typeof achievement.key === 'string' ? achievement.key : '',
                });
            }
        }
    }

    appendEntriesFromRuntimeParameters(parameter, output) {
        if (!parameter || typeof parameter !== 'object') {
            return;
        }

        for (const field of PARAMETER_TEXT_FIELDS) {
            this.appendTextEntry(output, parameter[field], {
                scope: 'runtimeParameter',
                field,
            });
        }

        const achievements = Array.isArray(parameter.baseAchievementData)
            ? parameter.baseAchievementData
            : [];

        for (let achievementIndex = 0; achievementIndex < achievements.length; achievementIndex++) {
            const achievement = achievements[achievementIndex];
            if (!achievement || typeof achievement !== 'object') {
                continue;
            }

            for (const field of ACHIEVEMENT_TEXT_FIELDS) {
                this.appendTextEntry(output, achievement[field], {
                    scope: 'runtimeAchievement',
                    achievementIndex,
                    field,
                    key: typeof achievement.key === 'string' ? achievement.key : '',
                });
            }
        }
    }

    translateAchievementCommandName(commandWindow, runtime) {
        if (!commandWindow || !Array.isArray(commandWindow._list)) {
            return;
        }

        for (const command of commandWindow._list) {
            if (!command || command.symbol !== 'Torigoya_Achievement') {
                continue;
            }

            if (typeof command.name !== 'string' || !command.name.trim()) {
                continue;
            }

            command.name = this.translateRuntimeText(command.name, runtime);
        }
    }

    enablePluginTranslation() {
        if (window.__CHEAT_TORIGOYA_ACHIEVEMENT2_TRANSLATOR_HOOKED__) {
            return;
        }

        const namespace = window.Torigoya && window.Torigoya.Achievement2;
        if (!namespace) {
            return;
        }

        const translator = this;
        const popupWindowClass = namespace.Window_AchievementPopup;
        if (
            popupWindowClass &&
            popupWindowClass.prototype &&
            typeof popupWindowClass.prototype.drawTitle === 'function'
        ) {
            popupWindowClass.prototype.drawTitle = function () {
                this.resetFontSettings();
                const runtime = translator.getRuntime();
                const title = translator.translateRuntimeText(
                    this._item &&
                        this._item.achievement &&
                        typeof this._item.achievement.title === 'string'
                        ? this._item.achievement.title
                        : '',
                    runtime
                );
                this.drawTextEx(`\\c[${namespace.parameter.popupTitleColor}]${title}`, 40, 0);
            };
        }

        if (
            popupWindowClass &&
            popupWindowClass.prototype &&
            typeof popupWindowClass.prototype.drawMessage === 'function'
        ) {
            popupWindowClass.prototype.drawMessage = function () {
                const textWidth = this.windowWidth() - this.standardPadding() * 2 - 40;
                const y = this.titleFontSize() + 5;
                const runtime = translator.getRuntime();
                const popupMessage = translator.translateRuntimeText(
                    namespace.parameter.popupMessage,
                    runtime
                );

                this.resetTextColor();
                this.contents.fontSize = this.messageFontSize();
                this.contents.drawText(
                    popupMessage,
                    40,
                    y,
                    textWidth,
                    this.messageFontSize(),
                    'left'
                );
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
                this.resetFontSettings();

                if (!item) {
                    return;
                }

                const rect = this.itemLineRect(index);
                const runtime = translator.getRuntime();
                const iconWidth = ImageManager.iconWidth + 8;

                this.resetTextColor();

                if (item.unlockInfo) {
                    this.changePaintOpacity(true);
                    this.drawIcon(
                        item.achievement.icon,
                        rect.x,
                        rect.y + (rect.height - ImageManager.iconHeight) / 2
                    );
                    this.drawText(
                        translator.translateRuntimeText(item.achievement.title, runtime),
                        rect.x + iconWidth,
                        rect.y,
                        rect.width - iconWidth,
                        'left'
                    );
                } else {
                    this.changePaintOpacity(false);
                    this.drawIcon(namespace.parameter.achievementMenuHiddenIcon, rect.x, rect.y);
                    this.drawText(
                        translator.translateRuntimeText(
                            namespace.parameter.achievementMenuHiddenTitle,
                            runtime
                        ),
                        rect.x + iconWidth,
                        rect.y,
                        rect.width - iconWidth,
                        'left'
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
                const item = this.item();
                if (!item) {
                    this.setHelpWindowItem(null);
                    return;
                }

                const runtime = translator.getRuntime();
                const description = item.unlockInfo
                    ? item.achievement.description
                    : item.achievement.hint || item.achievement.description;

                this.setHelpWindowItem({
                    description: translator.translateRuntimeText(description, runtime),
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

        window.__CHEAT_TORIGOYA_ACHIEVEMENT2_TRANSLATOR_HOOKED__ = true;
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

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[TorigoyaAchievement2Translator] Scan failed', error);
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
            const runtimeParameters =
                window.Torigoya &&
                window.Torigoya.Achievement2 &&
                window.Torigoya.Achievement2.parameter;
            this.appendEntriesFromRuntimeParameters(runtimeParameters, entries);
        }

        return entries;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text.trim()) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_torigoya_achievement2_${byCacheKey.size}`,
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
        const leftStrings = items.filter(
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
