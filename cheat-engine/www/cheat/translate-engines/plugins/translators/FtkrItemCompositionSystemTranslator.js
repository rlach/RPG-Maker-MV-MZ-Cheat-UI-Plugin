import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * FTKR_ItemCompositionSystem translator
 *
 * Plugin: FTKR_ItemCompositionSystem.js
 * Supported versions:
 * - v1.7.4 (MV): item composition scene/menu labels, confirmation/result labels,
 *   and plugin-command custom scene titles.
 *
 * Notes:
 * - Most translatable text is stored in plugin parameters, with many fields encoded
 *   as JSON string arrays.
 * - Additional runtime text can be injected via MV plugin command
 *   `ICS_OPEN` / `ICS_合成画面表示` args (title/slot/status labels), so map/common-event
 *   command lists are scanned for those payloads.
 * - Runtime hook targets FTKR's composition scene text rendering only
 *   (`Scene_ICS` draw path), preserving plugin command tokens and command symbols.
 */

const CACHE_TYPE = 'plugin_ftkr_item_composition_system';

const SIMPLE_TEXT_PARAMETER_KEYS = Object.freeze([
    'Category Format',
    'Item Number Delimiters',
    'Custom Cmd 1 Name',
    'Custom Cmd 2 Name',
    'Custom Cmd 3 Name',
    'Custom Cmd 4 Name',
    'Custom Cmd 5 Name',
]);

const JSON_ARRAY_TEXT_PARAMETER_KEYS = Object.freeze([
    'Composit Title Format',
    'Change Materials Name',
    'Change Resipes Name',
    'Slot Cmd Name',
    'Action Cmd Name',
    'End Cmd Name',
    'Item Cmd Name',
    'Weapon Cmd Name',
    'Armor Cmd Name',
    'Slot Title Format',
    'Empty Format',
    'Return All Slot',
    'Status Title Format',
    'Unkouwn Item Name',
    'Composit Number Format',
    'Recipe Title Format',
    'Difficulty Format',
    'Conf Title Format',
    'Confirmation Ok Format',
    'Confirmation Cancel Format',
    'Result Title Format',
    'Result Great Success',
    'Result Success',
    'Result Failure',
    'Result Reset',
    'Result Lost',
    'Result Ok Format',
    'End Title Format',
    'End Ok Format',
    'End Cancel Format',
]);

function normalizeText(value) {
    return String(value || '').trim();
}

function getSceneName() {
    const scene = window.SceneManager?._scene;
    return normalizeText(scene?.constructor?.name);
}

function isIcsSceneActive() {
    return getSceneName() === 'Scene_ICS';
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class FtkrItemCompositionSystemTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownSourceTexts = null;
        this._templateSourceTexts = null;
    }

    getPluginName() {
        return 'FTKR_ItemCompositionSystem';
    }

    getPluginLabel() {
        return 'FTKR ItemCompositionSystem';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = normalizeText(this.getPluginName()).toLowerCase();
        return (
            window.$plugins.find((plugin) => {
                const name = normalizeText(plugin?.name).toLowerCase();
                return !!name && name === pluginName;
            }) || null
        );
    }

    getRuntimeParameters() {
        const pluginManager = window.PluginManager;
        if (!pluginManager || typeof pluginManager.parameters !== 'function') {
            return null;
        }

        const parameters = pluginManager.parameters(this.getPluginName());
        return parameters && typeof parameters === 'object' ? parameters : null;
    }

    appendTextEntry(text, source, output) {
        if (!this.isUsableText(text)) {
            return;
        }

        output.push({
            text,
            source,
        });
    }

    appendJsonArrayEntries(rawValue, source, output) {
        const parsedArray = parseJsonSafely(rawValue, []);
        if (!Array.isArray(parsedArray)) {
            return;
        }

        for (let index = 0; index < parsedArray.length; index++) {
            this.appendTextEntry(parsedArray[index], { ...source, index }, output);
        }
    }

    appendMenuCommandEntries(rawValue, source, output) {
        const parsedArray = parseJsonSafely(rawValue, []);
        if (!Array.isArray(parsedArray)) {
            return;
        }

        for (let index = 0; index < parsedArray.length; index++) {
            const menuConfig = parseJsonSafely(parsedArray[index], null);
            const name = menuConfig?.name;
            this.appendTextEntry(name, { ...source, index, textKey: 'name' }, output);
        }
    }

    appendRecipeMaterialNumberFormatEntries(rawValue, source, output) {
        const parsed = parseJsonSafely(rawValue, null);
        const text = parsed?.text;
        this.appendTextEntry(text, { ...source, textKey: 'text' }, output);
    }

    appendParameterEntries(parameters, scope, output) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        for (const key of SIMPLE_TEXT_PARAMETER_KEYS) {
            this.appendTextEntry(parameters[key], { scope, field: key }, output);
        }

        for (const key of JSON_ARRAY_TEXT_PARAMETER_KEYS) {
            this.appendJsonArrayEntries(parameters[key], { scope, field: key }, output);
        }

        this.appendMenuCommandEntries(parameters['Menu Command'], { scope, field: 'Menu Command' }, output);
        this.appendRecipeMaterialNumberFormatEntries(
            parameters['Recipe Material Number Format'],
            { scope, field: 'Recipe Material Number Format' },
            output
        );
    }

    parseIcsPluginCommandLine(commandLine) {
        const line = normalizeText(commandLine);
        if (!line) {
            return null;
        }

        const parts = line.split(/\s+/);
        const commandToken = normalizeText(parts.shift());
        if (!commandToken || !/^ICS_/i.test(commandToken)) {
            return null;
        }

        const subCommand = commandToken.slice(4).toUpperCase();
        if (subCommand !== 'OPEN' && subCommand !== '合成画面表示') {
            return null;
        }

        if (parts.length === 1 && /^[+-]?\d+$/.test(normalizeText(parts[0]))) {
            return [];
        }

        const titles = [parts[0], parts[1], parts[2]];
        return titles
            .map((text, index) => ({ text: normalizeText(text), index }))
            .filter((entry) => this.isUsableText(entry.text));
    }

    collectPluginCommandEntriesFromList(list, baseMeta, output) {
        if (!Array.isArray(list)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 356) {
                continue;
            }

            const commandLine =
                Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === 'string'
                    ? cmd.parameters[0]
                    : '';

            const titles = this.parseIcsPluginCommandLine(commandLine);
            if (!Array.isArray(titles) || titles.length === 0) {
                continue;
            }

            for (const titleEntry of titles) {
                output.push({
                    text: titleEntry.text,
                    source: {
                        ...baseMeta,
                        cmdIdx,
                        commandType: 'ICS_OPEN',
                        titleIndex: titleEntry.index,
                    },
                });
            }
        }
    }

    collectCommonEventEntries(output) {
        const commonEvents = Array.isArray(window.$dataCommonEvents) ? window.$dataCommonEvents : [];
        for (let commonEventId = 0; commonEventId < commonEvents.length; commonEventId++) {
            const commonEvent = commonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectPluginCommandEntriesFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                output
            );
        }
    }

    async collectMapEntries(output) {
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
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

                        this.collectPluginCommandEntriesFromList(
                            page.list,
                            {
                                scope: 'mapEvent',
                                mapId,
                                eventIdx,
                                pageIdx,
                            },
                            output
                        );
                    }
                }
            } catch (error) {
                console.warn(`[FtkrItemCompositionSystemTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    buildKnownSourceTextSet() {
        if (this._knownSourceTexts instanceof Set) {
            return this._knownSourceTexts;
        }

        const known = new Set();
        for (const entry of this._scanEntries) {
            const text = normalizeText(entry?.text);
            if (text) {
                known.add(text);
            }
        }

        this._knownSourceTexts = known;
        return known;
    }

    getTemplateSourceTexts() {
        if (Array.isArray(this._templateSourceTexts)) {
            return this._templateSourceTexts;
        }

        const templateTexts = [];
        for (const text of this.buildKnownSourceTextSet()) {
            if (/%\d/.test(text)) {
                templateTexts.push(text);
            }
        }

        this._templateSourceTexts = templateTexts;
        return templateTexts;
    }

    resolveTemplateTranslation(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceText = String(text);
        for (const templateSourceText of this.getTemplateSourceTexts()) {
            const pattern = new RegExp(`^${escapeRegex(templateSourceText).replace(/%\d+/g, '(.+?)')}$`);
            const match = pattern.exec(sourceText);
            if (!match) {
                continue;
            }

            const translatedTemplate = this.resolveRuntimeTranslation(
                templateSourceText,
                runtime,
                this.getCacheType(),
                {
                    requireRuntimeTranslationActive: true,
                }
            );

            if (!this.isUsableText(translatedTemplate) || translatedTemplate === templateSourceText) {
                continue;
            }

            let translated = String(translatedTemplate);
            for (let captureIndex = 1; captureIndex < match.length; captureIndex++) {
                translated = translated.replaceAll(`%${captureIndex}`, String(match[captureIndex] || ''));
            }
            return translated;
        }

        return sourceText;
    }

    translateIcsText(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        const sourceText = String(text);
        if (this.buildKnownSourceTextSet().has(sourceText)) {
            return this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
                requireRuntimeTranslationActive: true,
            });
        }

        return this.resolveTemplateTranslation(sourceText, runtime);
    }

    enablePluginTranslation() {
        const getRuntime = this.getRuntime.bind(this);
        const translateIcsText = this.translateIcsText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);

        if (window.Window_MenuCommand?.prototype?.addOriginalCommands) {
            const originalAddOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;

            Window_MenuCommand.prototype.addOriginalCommands = function () {
                const result = originalAddOriginalCommands.apply(this, arguments);

                try {
                    const runtime = getRuntime();
                    if (!isRuntimeTranslationActive(runtime) || !Array.isArray(this._list)) {
                        return result;
                    }

                    for (const entry of this._list) {
                        if (entry?.symbol !== 'composition') {
                            continue;
                        }

                        entry.name = translateIcsText(entry.name, runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[FtkrItemCompositionSystemTranslator] Failed to translate menu command label',
                        error
                    );
                }

                return result;
            };
        }

        if (window.Window_Base?.prototype?.drawText) {
            const originalDrawText = Window_Base.prototype.drawText;

            Window_Base.prototype.drawText = function () {
                try {
                    const runtime = getRuntime();
                    if (
                        isRuntimeTranslationActive(runtime) &&
                        isIcsSceneActive() &&
                        arguments.length > 0
                    ) {
                        arguments[0] = translateIcsText(arguments[0], runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[FtkrItemCompositionSystemTranslator] Failed to translate drawText in Scene_ICS',
                        error
                    );
                }

                return originalDrawText.apply(this, arguments);
            };
        }

        if (window.Window_Base?.prototype?.drawTextEx) {
            const originalDrawTextEx = Window_Base.prototype.drawTextEx;

            Window_Base.prototype.drawTextEx = function () {
                try {
                    const runtime = getRuntime();
                    if (
                        isRuntimeTranslationActive(runtime) &&
                        isIcsSceneActive() &&
                        arguments.length > 0
                    ) {
                        arguments[0] = translateIcsText(arguments[0], runtime);
                    }
                } catch (error) {
                    console.warn(
                        '[FtkrItemCompositionSystemTranslator] Failed to translate drawTextEx in Scene_ICS',
                        error
                    );
                }

                return originalDrawTextEx.apply(this, arguments);
            };
        }
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
                this._knownSourceTexts = null;
                this._templateSourceTexts = null;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[FtkrItemCompositionSystemTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        const pluginEntry = this.findPluginEntry();
        if (pluginEntry?.parameters) {
            this.appendParameterEntries(pluginEntry.parameters, 'pluginEntryParameter', entries);
        }

        const runtimeParameters = this.getRuntimeParameters();
        if (runtimeParameters) {
            this.appendParameterEntries(runtimeParameters, 'runtimePluginManagerParameter', entries);
        }

        this.collectCommonEventEntries(entries);
        await this.collectMapEntries(entries);

        return entries;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = entry?.text;
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_ftkr_item_composition_system_${byCacheKey.size}`,
                value: text,
                cacheKey,
            });
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