import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../panels/translate-on-the-fly/ObjectTranslationModalMethods.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_MPP_CHOICE_EX_TRANSLATOR_HOOKED__';
const DEFAULT_CHOICE_HELP_COMMANDS = [
    'ChoiceHelp',
    '<ChoiceHelp>',
    '選択肢ヘルプ',
    '<選択肢ヘルプ>',
];

const runtimeGlobal = /** @type {any} */ (globalThis);

function isUsableText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function getRuntime() {
    return runtimeGlobal.__ensureTranslationRuntime?.() || runtimeGlobal.__TranslationRuntime || null;
}

function normalizeChoiceDisplayText(choiceText) {
    const original = String(choiceText || '');
    return original
        .replace(/\s?if\((.+?)\)/i, '')
        .replace(/\s?en\((.+?)\)/i, '');
}

function toStringArray(value) {
    return Array.isArray(value) ? value.map((entry) => String(entry ?? '')) : [];
}

function joinHelpTextLines(lines) {
    return toStringArray(lines).join('\n');
}

function splitHelpTextBlock(text) {
    return String(text ?? '').split('\n');
}

function normalizeAsDialogueText(text, runtime) {
    const value = String(text ?? '');
    if (!value) {
        return value;
    }

    const cleaned = runtime?.cleanTranslatedText?.(value) || value;

    const maxWidth = Number(runtime?.maxLineWidth) || 0;
    if (maxWidth > 0) {
        return runtime.wrapText(cleaned, maxWidth);
    }

    return cleaned;
}

export class MppChoiceExTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._choiceHelpCommands = null;
    }

    getPluginName() {
        return 'MPP_ChoiceEX';
    }

    getPluginLabel() {
        return 'MPP ChoiceEX';
    }

    getCacheType() {
        return 'plugin_mpp_choice_ex';
    }

    getChoiceCacheType() {
        return 'choice';
    }

    getChoiceHelpCacheType() {
        return this.getCacheType();
    }

    enablePluginTranslation() {
        if (runtimeGlobal[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (
            !runtimeGlobal.Game_Interpreter ||
            !Game_Interpreter.prototype ||
            typeof Game_Interpreter.prototype.setupChoices !== 'function'
        ) {
            return;
        }

        const originalSetupChoices = Game_Interpreter.prototype.setupChoices;
        const applyChoiceHelpTranslations = this.applyRuntimeChoiceHelpTranslations.bind(this);

        Game_Interpreter.prototype.setupChoices = function () {
            const result = originalSetupChoices.apply(this, arguments);

            try {
                applyChoiceHelpTranslations();
            } catch (error) {
                console.warn(
                    '[MppChoiceExTranslator] Failed to apply runtime choice help translation',
                    error
                );
            }

            return result;
        };

        runtimeGlobal[RUNTIME_HOOK_GUARD] = true;
    }

    applyRuntimeChoiceTranslations(data, startIndex) {
        if (!data || !Array.isArray(data.choices)) {
            return;
        }

        const runtime = getRuntime();
        if (
            !runtime ||
            typeof runtime.getCacheKey !== 'function' ||
            typeof runtime.hasUsableCacheValue !== 'function' ||
            !(runtime.translationCache instanceof Map)
        ) {
            return;
        }

        if (!Array.isArray(data.choices)) {
            return;
        }

        if (!Array.isArray(data.choices._translateOriginalChoices)) {
            Object.defineProperty(data.choices, '_translateOriginalChoices', {
                value: data.choices.slice(),
                enumerable: false,
                writable: true,
                configurable: true,
            });
        }

        for (let i = Math.max(0, Number(startIndex) || 0); i < data.choices.length; i++) {
            const originalText = String(
                data.choices._translateOriginalChoices[i] || data.choices[i] || ''
            );
            if (!isUsableText(originalText)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(originalText, this.getChoiceCacheType());
            runtime.markCacheKeySeen?.(cacheKey);

            if (!runtime.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            const cached = runtime.translationCache.get(cacheKey);
            if (!isUsableText(cached)) {
                continue;
            }

            data.choices[i] = cached;
        }
    }

    applyRuntimeChoiceHelpTranslations() {
        const runtime = getRuntime();
        const gameMessage = runtimeGlobal.$gameMessage;
        if (
            !runtime ||
            typeof runtime.getCacheKey !== 'function' ||
            typeof runtime.hasUsableCacheValue !== 'function' ||
            !(runtime.translationCache instanceof Map) ||
            !gameMessage ||
            typeof gameMessage.helpTexts !== 'function' ||
            typeof gameMessage.setChoiceHelpTexts !== 'function'
        ) {
            return;
        }

        const helpTexts = gameMessage.helpTexts();
        if (!Array.isArray(helpTexts) || helpTexts.length === 0) {
            return;
        }

        let changed = false;
        const translatedHelpTexts = helpTexts.map((entry) => {
            if (!Array.isArray(entry)) {
                return entry;
            }

            const originalBlock = joinHelpTextLines(entry);
            if (!isUsableText(originalBlock)) {
                return entry;
            }

            const cacheKey = runtime.getCacheKey(originalBlock, this.getChoiceHelpCacheType());
            runtime.markCacheKeySeen?.(cacheKey);

            if (!runtime.hasUsableCacheValue(cacheKey)) {
                return entry;
            }

            const cached = runtime.translationCache.get(cacheKey);
            if (!isUsableText(cached)) {
                return entry;
            }

            const normalized = normalizeAsDialogueText(cached, runtime);
            const translatedLines = splitHelpTextBlock(normalized);
            if (joinHelpTextLines(translatedLines) !== originalBlock) {
                changed = true;
            }
            return translatedLines;
        });

        if (changed) {
            gameMessage.setChoiceHelpTexts(translatedHelpTexts);
        }
    }

    getChoiceHelpCommands() {
        if (this._choiceHelpCommands instanceof Set) {
            return this._choiceHelpCommands;
        }

        const commands = new Set(DEFAULT_CHOICE_HELP_COMMANDS);
        for (const item of this.readConfiguredChoiceHelpCommands()) {
            commands.add(item);
        }

        this._choiceHelpCommands = commands;
        return commands;
    }

    readConfiguredChoiceHelpCommands() {
        try {
            if (runtimeGlobal.PluginManager && typeof PluginManager.parameters === 'function') {
                const parameters = PluginManager.parameters(this.getPluginName()) || {};
                const raw = parameters['Choice Help Commands'];
                if (typeof raw === 'string' && raw.trim()) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        return parsed.filter((item) => typeof item === 'string' && item.trim());
                    }
                }
            }
        } catch (error) {
            console.warn('[MppChoiceExTranslator] Failed to parse Choice Help Commands', error);
        }

        return [];
    }

    isChoiceHelpCommand(commandText) {
        return this.getChoiceHelpCommands().has(String(commandText || ''));
    }

    extractChoiceHelpBlock(list, startIndex) {
        const lines = [];
        let lastIndex = startIndex;

        for (let i = startIndex + 1; i < list.length; i++) {
            const command = list[i];
            if (!command || Number(command.code) !== 408) {
                break;
            }

            const lineText =
                Array.isArray(command.parameters) && typeof command.parameters[0] === 'string'
                    ? command.parameters[0]
                    : '';
            lines.push(lineText);
            lastIndex = i;
        }

        if (lines.length === 0) {
            return null;
        }

        const block = joinHelpTextLines(lines);
        if (!isUsableText(block)) {
            return null;
        }

        return {
            text: block,
            lineCount: lines.length,
            lastIndex,
        };
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
                console.warn('[MppChoiceExTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        this.scanCommonEvents(entries);
        await this.scanMapEvents(entries);

        return entries;
    }

    scanCommonEvents(entries) {
        const commonEvents = Array.isArray(runtimeGlobal.$dataCommonEvents)
            ? runtimeGlobal.$dataCommonEvents
            : [];
        if (commonEvents.length === 0) {
            return;
        }

        for (let commonEventId = 0; commonEventId < commonEvents.length; commonEventId++) {
            const commonEvent = commonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectChoiceTextsFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                entries
            );
        }
    }

    async scanMapEvents(entries) {
        const mapInfos = Array.isArray(runtimeGlobal.$dataMapInfos)
            ? runtimeGlobal.$dataMapInfos
            : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                this.scanMapDataEvents(mapData, mapId, entries);
            } catch (error) {
                console.warn(`[MppChoiceExTranslator] Failed to scan map ${mapId}`, error);
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

                this.collectChoiceTextsFromList(
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

    collectChoiceTextsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const code = Number(cmd.code);
            if (code === 102) {
                this.collectShowChoiceItems(cmd, baseMeta, output, cmdIdx, code);
            } else if (code === 402) {
                this.collectChoiceBranchItem(cmd, baseMeta, output, cmdIdx, code);
            } else if (code === 108) {
                this.collectChoiceHelpItem(list, cmd, baseMeta, output, cmdIdx, code);
            }
        }
    }

    collectShowChoiceItems(cmd, baseMeta, output, cmdIdx, code) {
        const choices =
            Array.isArray(cmd.parameters) && Array.isArray(cmd.parameters[0])
                ? cmd.parameters[0]
                : [];
        for (let choiceIdx = 0; choiceIdx < choices.length; choiceIdx++) {
            const choiceText = normalizeChoiceDisplayText(choices[choiceIdx]);
            if (!isUsableText(choiceText)) {
                continue;
            }

            output.push({
                text: choiceText,
                cacheType: this.getChoiceCacheType(),
                source: {
                    ...baseMeta,
                    cmdIdx,
                    code,
                    choiceIdx,
                },
            });
        }
    }

    collectChoiceBranchItem(cmd, baseMeta, output, cmdIdx, code) {
        const choiceBranchText =
            Array.isArray(cmd.parameters) && typeof cmd.parameters[1] === 'string'
                ? cmd.parameters[1]
                : '';
        const choiceText = normalizeChoiceDisplayText(choiceBranchText);
        if (!isUsableText(choiceText)) {
            return;
        }

        output.push({
            text: choiceText,
            cacheType: this.getChoiceCacheType(),
            source: {
                ...baseMeta,
                cmdIdx,
                code,
            },
        });
    }

    collectChoiceHelpItem(list, cmd, baseMeta, output, cmdIdx, code) {
        const commandText =
            Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === 'string'
                ? cmd.parameters[0]
                : '';
        if (!this.isChoiceHelpCommand(commandText)) {
            return;
        }

        const helpBlock = this.extractChoiceHelpBlock(list, cmdIdx);
        if (!helpBlock) {
            return;
        }

        output.push({
            text: helpBlock.text,
            cacheType: this.getChoiceHelpCacheType(),
            source: {
                ...baseMeta,
                cmdIdx,
                code,
                helpLineCount: helpBlock.lineCount,
            },
        });
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!isUsableText(text)) {
                continue;
            }

            const entryType =
                typeof entry.cacheType === 'string' && entry.cacheType
                    ? entry.cacheType
                    : this.getCacheType();
            const cacheKey = panel.getCacheKey(text, entryType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: entryType,
                    id: `plugin_mpp_choice_ex_${byCacheKey.size}`,
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
