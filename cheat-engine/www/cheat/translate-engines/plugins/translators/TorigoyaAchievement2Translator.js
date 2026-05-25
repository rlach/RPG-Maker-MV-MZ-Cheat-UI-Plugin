import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

const ACHIEVEMENT_TEXT_FIELDS = ['title', 'description', 'hint'];
const PARAMETER_TEXT_FIELDS = ['popupMessage', 'titleMenuText', 'achievementMenuHiddenTitle'];
const PLUGIN_NAME_ALIASES = ['TorigoyaMZ_Achievement2', 'Torigoya_Achievement2'];

function normalizePluginText(value) {
    if (typeof value !== 'string') {
        return value;
    }

    const parsed = parseJsonSafely(value, value);
    return typeof parsed === 'string' ? parsed : value;
}

function escapeNewlinesForCache(text) {
    if (typeof text !== 'string') {
        return '';
    }

    return text.replaceAll('\r\n', '\n').replaceAll('\n', String.raw`\n`);
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

    getPluginAliases() {
        return PLUGIN_NAME_ALIASES;
    }

    getPluginLabel() {
        return 'Torigoya Achievement2';
    }

    getCacheType() {
        return 'plugin_torigoya_achievement2';
    }

    translateRuntimeText(text, runtime) {
        if (!runtime) {
            return text;
        }

        if (!this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        if (typeof text !== 'string' || !text.trim()) {
            return text;
        }

        const normalized = normalizePluginText(text);
        const newlineNormalized = text.replaceAll('\r\n', '\n');
        const candidates = Array.from(
            new Set(
                [
                    text,
                    normalized,
                    newlineNormalized,
                    escapeNewlinesForCache(text),
                    escapeNewlinesForCache(normalized),
                    JSON.stringify(text),
                    JSON.stringify(normalized),
                    JSON.stringify(newlineNormalized),
                ].filter((candidate) => typeof candidate === 'string' && candidate.trim())
            )
        );

        for (const candidate of candidates) {
            const cacheKey = runtime.getCacheKey(candidate, this.getCacheType());

            runtime.trackCacheKeyUsage(cacheKey);

            if (!runtime.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            const cached = runtime.translationCache.get(cacheKey);
            if (typeof cached !== 'string' || !cached.trim()) {
                continue;
            }

            return cached;
        }

        return text;
    }

    postprocessDescriptionText(text, runtime) {
        if (typeof text !== 'string' || !text) {
            return text;
        }

        if (!runtime || !this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        const cleaned = runtime.cleanTranslatedText(text);

        const maxWidth = Number(runtime.descriptionMaxLineWidth || runtime.maxLineWidth || 0) || 0;

        return runtime.wrapText(cleaned, maxWidth, {
            flattenExistingNewlines: true,
        });
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
        const normalizedValue = normalizePluginText(text);
        const normalized = typeof normalizedValue === 'string' ? normalizedValue : '';
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
            if (command?.symbol !== 'Torigoya_Achievement') {
                continue;
            }

            if (typeof command.name !== 'string' || !command.name.trim()) {
                continue;
            }

            command.name = this.translateRuntimeText(command.name, runtime);
        }
    }

    enablePluginTranslation() {
        const namespace = window.Torigoya?.Achievement2;
        if (!namespace) {
            return false;
        }

        const getRuntime = () => this.getRuntime();
        const translateRuntimeText = this.translateRuntimeText.bind(this);
        const postprocessDescriptionText = this.postprocessDescriptionText.bind(this);
        const translateAchievementCommandName = this.translateAchievementCommandName.bind(this);
        const popupWindowClass = namespace.Window_AchievementPopup;
        if (!popupWindowClass?.prototype) {
            return false;
        }

        if (typeof popupWindowClass.prototype.drawTitle === 'function') {
            popupWindowClass.prototype.drawTitle = function () {
                this.resetFontSettings();
                const runtime = getRuntime();
                const title = translateRuntimeText(
                    this._item?.achievement && typeof this._item.achievement.title === 'string'
                        ? this._item.achievement.title
                        : '',
                    runtime
                );
                this.drawTextEx(
                    String.raw`\c[${namespace.parameter.popupTitleColor}]${title}`,
                    40,
                    0
                );
            };
        }

        if (typeof popupWindowClass.prototype.drawMessage === 'function') {
            popupWindowClass.prototype.drawMessage = function () {
                const textWidth = this.windowWidth() - this.standardPadding() * 2 - 40;
                const titleFontSize = this.titleFontSize?.() ?? this.standardFontSize();
                const y = titleFontSize + 5;
                const runtime = getRuntime();
                const popupMessage = translateRuntimeText(
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
            listWindowClass?.prototype &&
            typeof listWindowClass.prototype.drawItem === 'function'
        ) {
            listWindowClass.prototype.drawItem = function (index) {
                const item = this._data[index];
                this.resetFontSettings();

                if (!item) {
                    return;
                }

                const rect = this.itemLineRect?.(index) || this.itemRect(index);
                const runtime = getRuntime();
                const iconWidth =
                    (typeof ImageManager.iconWidth === 'number'
                        ? ImageManager.iconWidth
                        : Window_Base._iconWidth) + 8;
                const iconHeight =
                    typeof ImageManager.iconHeight === 'number'
                        ? ImageManager.iconHeight
                        : Window_Base._iconHeight;

                this.resetTextColor();

                if (item.unlockInfo) {
                    this.changePaintOpacity(true);
                    this.drawIcon(
                        item.achievement.icon,
                        rect.x,
                        rect.y + (rect.height - iconHeight) / 2
                    );
                    this.drawText(
                        translateRuntimeText(item.achievement.title, runtime),
                        rect.x + iconWidth,
                        rect.y,
                        rect.width - iconWidth,
                        'left'
                    );
                } else {
                    this.changePaintOpacity(false);
                    this.drawIcon(namespace.parameter.achievementMenuHiddenIcon, rect.x, rect.y);
                    this.drawText(
                        translateRuntimeText(
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
            listWindowClass?.prototype &&
            typeof listWindowClass.prototype.updateHelp === 'function'
        ) {
            listWindowClass.prototype.updateHelp = function () {
                const item = this.item();
                if (!item) {
                    this.setHelpWindowItem(null);
                    return;
                }

                const runtime = getRuntime();
                const description = item.unlockInfo
                    ? item.achievement.description
                    : item.achievement.hint || item.achievement.description;
                const normalizedDescription = normalizePluginText(description);
                const translatedDescription = translateRuntimeText(normalizedDescription, runtime);

                this.setHelpWindowItem({
                    description: postprocessDescriptionText(translatedDescription, runtime),
                    meta: {},
                });
            };
        }

        if (
            window.Window_TitleCommand?.prototype &&
            typeof Window_TitleCommand.prototype.makeCommandList === 'function'
        ) {
            const originalMakeCommandList = Window_TitleCommand.prototype.makeCommandList;
            Window_TitleCommand.prototype.makeCommandList = function () {
                const result = originalMakeCommandList.apply(this, arguments);
                translateAchievementCommandName(this, getRuntime());
                return result;
            };
        }

        if (
            window.Window_MenuCommand?.prototype &&
            typeof Window_MenuCommand.prototype.addOriginalCommands === 'function'
        ) {
            const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
            Window_MenuCommand.prototype.addOriginalCommands = function () {
                const result = originalAddOriginalCommands.apply(this, arguments);
                translateAchievementCommandName(this, getRuntime());
                return result;
            };
        }

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
                console.warn('[TorigoyaAchievement2Translator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const pluginParameters =
            pluginEntry?.parameters && typeof pluginEntry.parameters === 'object'
                ? pluginEntry.parameters
                : null;

        if (pluginParameters) {
            this.appendEntriesFromPluginParameters(pluginParameters, entries);
        }

        if (entries.length <= 0) {
            const runtimeParameters = window.Torigoya?.Achievement2?.parameter;
            this.appendEntriesFromRuntimeParameters(runtimeParameters, entries);
        }

        return entries;
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
                    id: `plugin_torigoya_achievement2_${byCacheKey.size}`,
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
