/**
 * RJ01042745 Game-Specific Translator
 *
 * Fixes two game-specific runtime/data issues:
 * 1) TsumioBattleResult bonus line should translate the exp label prefix before
 *    concatenating dynamic bonus percent text.
 * 2) Dynamic actor profiles are set via event scripts (direct setProfile('...') or
 *    variable flow 122 -> 355). This translator scans those sources for Mass Translate
 *    and resolves Game_Actor.profile() through actor_profile cache at runtime.
 *
 * Usage: Copy this file to www/cheat-settings/translate-cache/js/
 */

const BasePluginTranslator = globalThis.__CheatBasePluginTranslator;

const PROFILE_CACHE_TYPE = 'actor_profile';
const BONUS_SOURCE_PLUGIN_NAME = 'TsumioBattleResult';
const BONUS_SOURCE_PARAM_KEYS = ['DescSettings', '説明文の設定'];
const BONUS_SOURCE_FIELD = 'expDesc';
const PROFILE_HOOK_FLAG = '__CHEAT_RJ01042745_PROFILE_HOOKED__';
const DRAW_TEXT_HOOK_FLAG = '__CHEAT_RJ01042745_BONUS_HOOKED__';

function parseJsonSafely(value, fallback = null) {
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

function padMapId(mapId) {
    const id = Number(mapId) || 0;
    return String(id).padStart(3, '0');
}

function isUsableText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function normalizeScriptLiteral(expression) {
    const source = String(expression || '').trim();
    if (!source || source.length < 2) {
        return '';
    }

    const quote = source[0];
    if ((quote !== '\'' && quote !== '"') || !source.endsWith(quote)) {
        return '';
    }

    let body = source.slice(1, -1);
    body = body
        .replaceAll(String.raw`\\`, '\\')
        .replaceAll(String.raw`\n`, '\n')
        .replaceAll(String.raw`\r`, '\r')
        .replaceAll(String.raw`\t`, '\t')
        .replaceAll(String.raw`\'`, "'")
        .replaceAll(String.raw`\"`, '"');

    return body;
}

function extractSetProfileCalls(scriptText) {
    const source = String(scriptText || '');
    const calls = [];
    const regex = /\$gameActors\.actor\s*\(\s*(\d+)\s*\)\.setProfile\s*\(\s*([\s\S]*?)\s*\)\s*;/g;
    let match = regex.exec(source);

    while (match) {
        calls.push({
            actorId: Number(match[1] || 0),
            argument: String(match[2] || '').trim(),
        });
        match = regex.exec(source);
    }

    return calls;
}

function extractVariableIdFromExpression(expression) {
    const source = String(expression || '').trim();
    const match = /^\$gameVariables\.value\s*\(\s*(\d+)\s*\)$/.exec(source);
    if (!match) {
        return 0;
    }

    return Number(match[1] || 0);
}

function extractStringFromVariableCommand(command122, variableId) {
    if (!command122 || Number(command122.code) !== 122) {
        return '';
    }

    const params = Array.isArray(command122.parameters) ? command122.parameters : [];
    const startVarId = Number(params[0] || 0);
    const endVarId = Number(params[1] || 0);
    const operationType = Number(params[2] || 0);
    const operandType = Number(params[3] || 0);
    const operand = String(params[4] || '').trim();

    if (!variableId || variableId < startVarId || variableId > endVarId) {
        return '';
    }

    // Only handle direct assignment from script-literal payload.
    if (operationType !== 0 || operandType !== 4) {
        return '';
    }

    return normalizeScriptLiteral(operand);
}

async function loadMapDataByIdLocal(mapId) {
    const filename = `Map${padMapId(mapId)}.json`;

    try {
        if (typeof fetch === 'function') {
            const response = await fetch(`./data/${filename}`);
            if (response?.ok) {
                return await response.json();
            }
        }
    } catch {
        // Fall back to fs path read below.
    }

    try {
        const fs = require('fs');
        const path = require('path');
        const absolutePath = path.resolve(process.cwd(), 'www', 'data', filename);
        if (!fs.existsSync(absolutePath)) {
            return null;
        }

        const raw = fs.readFileSync(absolutePath, 'utf-8');
        return parseJsonSafely(raw, null);
    } catch {
        return null;
    }
}

export class RJ01042745Translator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._bonusSourceText = null;
    }

    getPluginName() {
        return 'RJ01042745';
    }

    getPluginLabel() {
        return 'RJ01042745 Game Fixes';
    }

    getCacheType() {
        return 'plugin_rj01042745';
    }

    detectPlugin() {
        return true;
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
                console.warn('[RJ01042745Translator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        this.collectCommonEventProfileEntries(entries);
        this.collectTroopProfileEntries(entries);
        await this.collectMapProfileEntries(entries);

        return entries;
    }

    collectCommonEventProfileEntries(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let commonEventId = 0; commonEventId < window.$dataCommonEvents.length; commonEventId++) {
            const commonEvent = window.$dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectProfileEntriesFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                output
            );
        }
    }

    collectTroopProfileEntries(output) {
        if (!Array.isArray(window.$dataTroops)) {
            return;
        }

        for (let troopId = 0; troopId < window.$dataTroops.length; troopId++) {
            const troop = window.$dataTroops[troopId];
            if (!troop || !Array.isArray(troop.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < troop.pages.length; pageIdx++) {
                const page = troop.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectProfileEntriesFromList(
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

    async collectMapProfileEntries(output) {
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];

        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id || 0);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataByIdLocal(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                this.collectMapDataProfileEntries(mapData, mapId, output);
            } catch (error) {
                console.warn(`[RJ01042745Translator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    collectMapDataProfileEntries(mapData, mapId, output) {
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

                this.collectProfileEntriesFromList(
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

    collectProfileEntriesFromList(list, baseMeta, output) {
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
            if (code !== 355) {
                cmdIdx += 1;
                continue;
            }

            cmdIdx = this.collectProfileEntriesFromScriptBlock(list, cmdIdx, baseMeta, output);
        }
    }

    collectProfileEntriesFromScriptBlock(list, startIdx, baseMeta, output) {
        const firstCommand = list[startIdx];
        const scriptLines = [String(firstCommand?.parameters?.[0] || '')];
        let cursor = startIdx + 1;

        while (cursor < list.length && Number(list[cursor]?.code) === 655) {
            scriptLines.push(String(list[cursor]?.parameters?.[0] || ''));
            cursor += 1;
        }

        const scriptText = scriptLines.join('\n');
        const calls = extractSetProfileCalls(scriptText);
        const previousCommand = startIdx > 0 ? list[startIdx - 1] : null;

        for (const call of calls) {
            const argument = String(call.argument || '').trim();
            let profileText = normalizeScriptLiteral(argument);

            if (!isUsableText(profileText)) {
                const variableId = extractVariableIdFromExpression(argument);
                if (variableId > 0) {
                    profileText = extractStringFromVariableCommand(previousCommand, variableId);
                }
            }

            if (!isUsableText(profileText)) {
                continue;
            }

            output.push({
                text: profileText,
                actorId: call.actorId,
                source: {
                    ...baseMeta,
                    cmdIdx: startIdx,
                    kind: 'setProfile',
                },
            });
        }

        return cursor;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '').trim();
            if (!isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, PROFILE_CACHE_TYPE);
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: PROFILE_CACHE_TYPE,
                id: `rj01042745_actor_profile_${byCacheKey.size}`,
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

    getBonusSourceText() {
        if (this._bonusSourceText !== null) {
            return this._bonusSourceText;
        }

        const pluginEntry = this.findPluginEntry(BONUS_SOURCE_PLUGIN_NAME);
        const parameters = pluginEntry?.parameters || null;

        if (!parameters || typeof parameters !== 'object') {
            this._bonusSourceText = '';
            return this._bonusSourceText;
        }

        let descSettings = null;
        for (const key of BONUS_SOURCE_PARAM_KEYS) {
            const parsed = parseJsonSafely(parameters[key], null);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                descSettings = parsed;
                break;
            }
        }

        this._bonusSourceText = String(descSettings?.[BONUS_SOURCE_FIELD] || '').trim();
        return this._bonusSourceText;
    }

    translateBonusLabelPrefix(sourceText, runtime) {
        if (!isUsableText(sourceText) || !runtime) {
            return sourceText;
        }

        const cacheKey = runtime.getCacheKey(sourceText, 'plugin_tsumio_battle_result');
        runtime.trackCacheKeyUsage(cacheKey);

        if (!this.isRuntimeTranslationActive(runtime)) {
            return sourceText;
        }

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return sourceText;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return isUsableText(cached) ? cached : sourceText;
    }

    tryTranslateBonusText(text, runtime) {
        if (!isUsableText(text)) {
            return text;
        }

        const sourcePrefix = this.getBonusSourceText();
        if (!isUsableText(sourcePrefix) || !text.startsWith(sourcePrefix)) {
            return text;
        }

        const translatedPrefix = this.translateBonusLabelPrefix(sourcePrefix, runtime);
        if (!isUsableText(translatedPrefix) || translatedPrefix === sourcePrefix) {
            return text;
        }

        return `${translatedPrefix}${text.slice(sourcePrefix.length)}`;
    }

    enablePluginTranslation() {
        if (
            typeof Game_Actor === 'undefined' ||
            !Game_Actor.prototype ||
            typeof Game_Actor.prototype.profile !== 'function' ||
            typeof Window_Base === 'undefined' ||
            !Window_Base.prototype ||
            typeof Window_Base.prototype.drawText !== 'function'
        ) {
            return false;
        }

        if (!Game_Actor.prototype[PROFILE_HOOK_FLAG]) {
            const originalProfile = Game_Actor.prototype.profile;
            const getRuntime = this.getRuntime.bind(this);
            const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);

            Game_Actor.prototype.profile = function () {
                const sourceText = originalProfile.apply(this, arguments);
                const runtime = getRuntime();
                if (!runtime || !isUsableText(sourceText)) {
                    return sourceText;
                }

                const cacheKey = runtime.getCacheKey(sourceText, PROFILE_CACHE_TYPE);
                runtime.trackCacheKeyUsage(cacheKey);

                if (!isRuntimeTranslationActive(runtime)) {
                    return sourceText;
                }

                if (!runtime.hasUsableCacheValue(cacheKey)) {
                    return sourceText;
                }

                const cached = runtime.translationCache.get(cacheKey);
                return isUsableText(cached) ? cached : sourceText;
            };

            Game_Actor.prototype[PROFILE_HOOK_FLAG] = true;
        }

        if (!Window_Base.prototype[DRAW_TEXT_HOOK_FLAG]) {
            const originalDrawText = Window_Base.prototype.drawText;
            const getRuntime = this.getRuntime.bind(this);
            const tryTranslateBonusText = this.tryTranslateBonusText.bind(this);

            Window_Base.prototype.drawText = function (text, x, y, maxWidth, align) {
                let nextText = text;

                try {
                    const runtime = getRuntime();
                    const windowName = String(this?.constructor?.name || '');

                    if (runtime && windowName === 'Window_ExpCalcArea' && typeof text === 'string') {
                        nextText = tryTranslateBonusText(text, runtime);
                    }
                } catch (error) {
                    console.warn('[RJ01042745Translator] Failed to translate bonus label', error);
                }

                return originalDrawText.call(this, nextText, x, y, maxWidth, align);
            };

            Window_Base.prototype[DRAW_TEXT_HOOK_FLAG] = true;
        }

        return true;
    }
}
