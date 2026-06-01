/**
 * RJ01274529 Game-Specific Translator
 *
 * Target plugin:
 * - TMCard.js (MV)
 *
 * Translation notes:
 * - Collects card-game UI labels from TMCard plugin parameters.
 * - Collects opponent names from MV plugin command 356 lines:
 *   startCardBattle <enemyName> ...
 *   startDeckSelect <enemyName> ...
 * - Runtime hook translates drawText/drawTextEx only when source text is in the
 *   scanned TMCard source set, minimizing side effects.
 *
 * Usage: Copy this file to www/cheat-settings/translate-cache/js/
 */

const BasePluginTranslator = globalThis.__CheatBasePluginTranslator;

const CACHE_TYPE = 'plugin_rj01274529_tmcard';
const HOOK_FLAG = '__CHEAT_RJ01274529_TMCARD_HOOKED__';
const BATTLE_COMMANDS = new Set(['startcardbattle', 'startdeckselect']);

function padMapId(mapId) {
    const id = Number(mapId) || 0;
    return String(id).padStart(3, '0');
}

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
        // Fall through to fs read for NW.js path.
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

function parseCommandEnemyName(commandLine) {
    const line = typeof commandLine === 'string' ? commandLine : '';
    if (!line.trim()) {
        return null;
    }

    // Mirror MV command356 parser behavior.
    const parts = line.split(' ');
    const commandName = String(parts.shift() || '')
        .trim()
        .toLowerCase();
    if (!BATTLE_COMMANDS.has(commandName)) {
        return null;
    }

    const enemyName = String(parts.shift() || '').trim();
    return enemyName || null;
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function collectArrayTexts(values, scope, output) {
    if (!Array.isArray(values) || !Array.isArray(output)) {
        return;
    }

    for (let index = 0; index < values.length; index++) {
        const text = normalizeText(values[index]);
        if (!text) {
            continue;
        }

        output.push({
            text,
            source: {
                scope,
                index,
            },
        });
    }
}

export class RJ01274529Translator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._knownSourceTexts = null;
    }

    getPluginName() {
        return 'TMCard';
    }

    getPluginLabel() {
        return 'TMCard (RJ01274529)';
    }

    getCacheType() {
        return CACHE_TYPE;
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
                this._knownSourceTexts = null;
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[RJ01274529Translator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        this.collectParameterEntries(entries);
        this.collectCommonEventEntries(entries);
        this.collectTroopEntries(entries);
        await this.collectMapEntries(entries);

        return entries;
    }

    collectParameterEntries(output) {
        const card = globalThis.TMPlugin?.Card;
        if (!card || typeof card !== 'object') {
            return;
        }

        const singleTexts = [
            normalizeText(card.CommandDeckEdit),
            normalizeText(card.ItemCardPositionName),
        ];

        for (let i = 0; i < singleTexts.length; i++) {
            if (!singleTexts[i]) {
                continue;
            }
            output.push({ text: singleTexts[i], source: { scope: 'parametersSingle', index: i } });
        }

        collectArrayTexts(card.ParamNames, 'parametersParamNames', output);
        collectArrayTexts(card.ItemCardParamNames, 'parametersItemCardParamNames', output);
        collectArrayTexts(card.RareNames, 'parametersRareNames', output);
        collectArrayTexts(card.PositionNames, 'parametersPositionNames', output);
        collectArrayTexts(card.DeckNames, 'parametersDeckNames', output);
    }

    collectEnemyNameEntriesFromList(list, baseMeta, output) {
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
            const enemyName = parseCommandEnemyName(commandLine);
            if (!enemyName) {
                continue;
            }

            output.push({
                text: enemyName,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });
        }
    }

    collectCommonEventEntries(output) {
        if (!Array.isArray(globalThis.$dataCommonEvents)) {
            return;
        }

        for (let commonEventId = 0; commonEventId < globalThis.$dataCommonEvents.length; commonEventId++) {
            const commonEvent = globalThis.$dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectEnemyNameEntriesFromList(
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
        if (!Array.isArray(globalThis.$dataTroops)) {
            return;
        }

        for (let troopId = 0; troopId < globalThis.$dataTroops.length; troopId++) {
            const troop = globalThis.$dataTroops[troopId];
            if (!troop || !Array.isArray(troop.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < troop.pages.length; pageIdx++) {
                const page = troop.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectEnemyNameEntriesFromList(
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
        const mapInfos = Array.isArray(globalThis.$dataMapInfos) ? globalThis.$dataMapInfos : [];

        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataByIdLocal(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                this.collectMapEventEntries(mapData.events, mapId, output);
            } catch (error) {
                console.warn(`[RJ01274529Translator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    collectMapEventEntries(events, mapId, output) {
        for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
            const event = events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            this.collectMapEventPageEntries(event.pages, mapId, eventIdx, output);
        }
    }

    collectMapEventPageEntries(pages, mapId, eventIdx, output) {
        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            const page = pages[pageIdx];
            if (!page || !Array.isArray(page.list)) {
                continue;
            }

            this.collectEnemyNameEntriesFromList(
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

    enablePluginTranslation() {
        const windowBaseProto = globalThis.Window_Base?.prototype;
        if (!windowBaseProto) {
            return false;
        }

        if (windowBaseProto[HOOK_FLAG]) {
            return true;
        }

        if (typeof windowBaseProto.drawText !== 'function' || typeof windowBaseProto.drawTextEx !== 'function') {
            return false;
        }

        const originalDrawText = windowBaseProto.drawText;
        const originalDrawTextEx = windowBaseProto.drawTextEx;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const buildKnownSourceTextSet = this.buildKnownSourceTextSet.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);
        const getCacheType = this.getCacheType.bind(this);

        windowBaseProto.drawText = function () {
            if (arguments.length > 0 && typeof arguments[0] === 'string') {
                const runtime = getRuntime();
                if (isRuntimeTranslationActive(runtime)) {
                    const source = String(arguments[0]);
                    if (buildKnownSourceTextSet().has(source)) {
                        arguments[0] = resolveRuntimeTranslation(
                            source,
                            runtime,
                            getCacheType(),
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: source,
                            }
                        );
                    }
                }
            }

            return originalDrawText.apply(this, arguments);
        };

        windowBaseProto.drawTextEx = function () {
            if (arguments.length > 0 && typeof arguments[0] === 'string') {
                const runtime = getRuntime();
                if (isRuntimeTranslationActive(runtime)) {
                    const source = String(arguments[0]);
                    if (buildKnownSourceTextSet().has(source)) {
                        arguments[0] = resolveRuntimeTranslation(
                            source,
                            runtime,
                            getCacheType(),
                            {
                                requireRuntimeTranslationActive: true,
                                missValue: source,
                            }
                        );
                    }
                }
            }

            return originalDrawTextEx.apply(this, arguments);
        };

        windowBaseProto[HOOK_FLAG] = true;
        return true;
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!text) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_rj01274529_tmcard_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime } = {}) {
        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    getCachedCountsSync({ runtime } = {}) {
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
