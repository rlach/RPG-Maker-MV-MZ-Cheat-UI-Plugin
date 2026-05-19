import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { TAG_BRACKET, TAG_TYPE } from '../../ai-engine/constants.js';

/*
 * CommonPopupCore (Yana) translator.
 *
 * Supported versions:
 * - MV v1.06
 *
 * Translation notes:
 * - Static text is primarily carried by MV plugin commands (code 356):
 *   CommonPopup add text:... and Japanese alias ポップアップ 表示 text:...
 * - Script command blocks can also call addPopup(["add", "text:..."]).
 * - Runtime hook point is Game_Interpreter.prototype.addPopup, translating only
 *   the text payload and preserving command/action tokens unchanged.
 */

const CACHE_TYPE = 'plugin_common_popup_core';
const RUNTIME_HOOK_GUARD = '__CHEAT_COMMON_POPUP_CORE_TRANSLATOR_HOOKED__';
const ACTION_ADD = 'add';
const ACTION_ADD_JA = '表示';
const COMMAND_COMMON_POPUP = 'commonpopup';
const COMMAND_COMMON_POPUP_JA = 'ポップアップ';
const PLUGIN_TAGS = [
    {
        description: 'Shows an icon as part of text, will match text size.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'I',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
        alwaysTranslate: false,
        alwaysAddToKnowledgeBase: false,
    },
    {
        description: 'Shows an icon as part of text, will match text size.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'FS',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: false,
        requiredConsistency: true,
        alwaysTranslate: false,
        alwaysAddToKnowledgeBase: false,
    },
];

function isCommonPopupCommandName(value) {
    const commandName = String(value || '')
        .trim()
        .toLowerCase();
    return commandName === COMMAND_COMMON_POPUP || commandName === COMMAND_COMMON_POPUP_JA;
}

function isAddAction(value) {
    const action = String(value || '')
        .trim()
        .toLowerCase();
    return action === ACTION_ADD || action === ACTION_ADD_JA;
}

function splitPluginCommandLine(commandLine) {
    const normalized = String(commandLine || '').trim();
    if (!normalized) {
        return [];
    }

    return normalized.split(/\s+/);
}

function extractTextPayloadFromToken(token) {
    const text = String(token || '');
    const match = /^text[:：](.*)$/i.exec(text);
    if (!match) {
        return null;
    }

    return String(match[1] || '');
}

function replaceTextPayloadToken(token, translatedText) {
    const text = String(token || '');
    const match = /^text([:：])(.*)$/i.exec(text);
    if (!match) {
        return token;
    }

    const separator = match[1];
    return `text${separator}${translatedText}`;
}

function extractTextFromPopupArgs(args) {
    if (!Array.isArray(args)) {
        return null;
    }

    for (const token of args) {
        const payload = extractTextPayloadFromToken(token);
        if (payload !== null) {
            return payload;
        }
    }

    return null;
}

function extractTextFromMvPluginCommand(commandLine) {
    const parts = splitPluginCommandLine(commandLine);
    if (parts.length < 2) {
        return null;
    }

    if (!isCommonPopupCommandName(parts[0])) {
        return null;
    }

    if (!isAddAction(parts[1])) {
        return null;
    }

    return extractTextFromPopupArgs(parts.slice(2));
}

function extractScriptTexts(scriptBlock) {
    const result = [];
    const source = String(scriptBlock || '');
    const addPopupRegex = /addPopup\s*\(\s*\[([\s\S]*?)\]\s*\)/g;
    let addPopupMatch = addPopupRegex.exec(source);

    while (addPopupMatch) {
        const arrayBody = String(addPopupMatch[1] || '');
        const quotedStringRegex = /(['"])(.*?)\1/g;
        let quotedMatch = quotedStringRegex.exec(arrayBody);

        while (quotedMatch) {
            const payload = extractTextPayloadFromToken(quotedMatch[2]);
            if (payload !== null) {
                result.push(payload);
            }
            quotedMatch = quotedStringRegex.exec(arrayBody);
        }

        addPopupMatch = addPopupRegex.exec(source);
    }

    return result;
}

export class CommonPopupCoreTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'CommonPopupCore';
    }

    getPluginLabel() {
        return 'CommonPopupCore';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return true;
        }

        if (
            !window.Game_Interpreter ||
            !Game_Interpreter.prototype ||
            typeof Game_Interpreter.prototype.addPopup !== 'function'
        ) {
            return false;
        }
        this.registerPluginCustomTags(PLUGIN_TAGS);

        const originalAddPopup = Game_Interpreter.prototype.addPopup;

        Game_Interpreter.prototype.addPopup = ((pluginTranslator) => {
            return function (argParam) {
                const runtime = pluginTranslator.getRuntime();
                if (!pluginTranslator.isRuntimeTranslationActive(runtime)) {
                    return originalAddPopup.apply(this, arguments);
                }

                const translatedArgParam = pluginTranslator.translatePopupArgs(argParam, runtime);
                if (translatedArgParam === argParam) {
                    return originalAddPopup.apply(this, arguments);
                }

                const nextArguments = Array.from(arguments);
                nextArguments[0] = translatedArgParam;
                return originalAddPopup.apply(this, nextArguments);
            };
        })(this);

        window[RUNTIME_HOOK_GUARD] = true;
        return true;
    }

    translatePopupArgs(argParam, runtime) {
        if (!Array.isArray(argParam)) {
            return argParam;
        }

        let changed = false;
        const nextArgParam = argParam.slice();

        for (let index = 0; index < nextArgParam.length; index++) {
            const sourceText = extractTextPayloadFromToken(nextArgParam[index]);
            if (!this.isUsableText(sourceText)) {
                continue;
            }

            const translatedText = this.resolveRuntimeTranslation(sourceText, runtime, CACHE_TYPE, {
                requireRuntimeTranslationActive: true,
                missValue: sourceText,
            });

            if (!this.isUsableText(translatedText) || translatedText === sourceText) {
                continue;
            }

            nextArgParam[index] = replaceTextPayloadToken(nextArgParam[index], translatedText);
            changed = true;
        }

        return changed ? nextArgParam : argParam;
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
                console.warn('[CommonPopupCoreTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this.collectCommonEventEntries(entries);
        this.collectTroopEntries(entries);
        await this.collectMapEntries(entries);
        return entries;
    }

    collectCommonEventEntries(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
            const commonEvent = $dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectPopupTextsFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                output
            );
        }
    }

    collectTroopEntries(output) {
        if (!Array.isArray(window.$dataTroops)) {
            return;
        }

        for (let troopId = 0; troopId < $dataTroops.length; troopId++) {
            const troop = $dataTroops[troopId];
            if (!troop || !Array.isArray(troop.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < troop.pages.length; pageIdx++) {
                const page = troop.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectPopupTextsFromList(
                    page.list,
                    {
                        scope: 'troopEvent',
                        troopId,
                        pageIdx,
                    },
                    output
                );
            }
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

                this.collectMapEventEntries(mapData.events, mapId, output);
            } catch (error) {
                console.warn(`[CommonPopupCoreTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    collectMapEventEntries(events, mapId, output) {
        for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
            const event = events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                const page = event.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectPopupTextsFromList(
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
    }

    pushTextEntry(output, text, baseMeta, cmdIdx, kind) {
        if (!this.isUsableText(text)) {
            return;
        }

        output.push({
            text,
            source: {
                ...baseMeta,
                cmdIdx,
                kind,
            },
        });
    }

    collectPopupTextsFromScriptBlock(list, startIdx, baseMeta, output) {
        const firstCommand = list[startIdx];
        const scriptLines = [String(firstCommand?.parameters?.[0] || '')];
        let cursor = startIdx + 1;

        while (cursor < list.length && Number(list[cursor]?.code) === 655) {
            scriptLines.push(String(list[cursor]?.parameters?.[0] || ''));
            cursor += 1;
        }

        const scriptText = scriptLines.join('\n');
        const texts = extractScriptTexts(scriptText);
        for (const text of texts) {
            this.pushTextEntry(output, text, baseMeta, startIdx, 'script');
        }

        return cursor;
    }

    collectPopupTextsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        let cmdIdx = 0;
        while (cmdIdx < list.length) {
            const command = list[cmdIdx];
            if (!command) {
                cmdIdx += 1;
                continue;
            }

            const code = Number(command.code);

            if (code === 356) {
                const commandLine = String(command.parameters?.[0] || '');
                const text = extractTextFromMvPluginCommand(commandLine);
                this.pushTextEntry(output, text, baseMeta, cmdIdx, 'pluginCommand');
                cmdIdx += 1;
                continue;
            }

            if (code === 355) {
                cmdIdx = this.collectPopupTextsFromScriptBlock(list, cmdIdx, baseMeta, output);
                continue;
            }

            cmdIdx += 1;
        }
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, CACHE_TYPE);
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: CACHE_TYPE,
                id: `plugin_common_popup_core_${byCacheKey.size}`,
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
