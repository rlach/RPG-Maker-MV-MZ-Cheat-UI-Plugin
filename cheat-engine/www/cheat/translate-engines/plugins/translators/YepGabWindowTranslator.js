import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

/**
 * YEP Gab Window translator.
 *
 * Supported versions:
 * - v1.04 (MV)
 *
 * Translation notes:
 * - Translatable text is stored in MV plugin commands as `GabText ...`.
 * - The plugin displays queued gabs through `Window_Gab#processNewGabData`.
 * - Scan common events, map events, and troop events because gab commands can appear in any event list.
 */
const CACHE_TYPE = 'plugin_yep_gab_window';
const GAB_TEXT_COMMAND = 'GABTEXT';

function normalizeCommandName(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

function buildGabTextFromArgs(args) {
    if (!Array.isArray(args) || args.length === 0) {
        return '';
    }

    let text = '';
    for (const arg of args) {
        text = text + String(arg || '') + ' '; 
    }

    return text;
}

export class YepGabWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'YEP_GabWindow';
    }

    getPluginLabel() {
        return 'YEP Gab Window';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    extractGabTextEntryFromCommandLine(commandLine) {
        const line = String(commandLine || '');
        if (!line.trim()) {
            return null;
        }

        const parts = line.split(' ');
        const commandName = String(parts.shift() || '').trim();
        if (normalizeCommandName(commandName) !== GAB_TEXT_COMMAND) {
            return null;
        }

        const text = buildGabTextFromArgs(parts);
        if (!this.isUsableText(text)) {
            return null;
        }

        return {
            commandName,
            text,
        };
    }

    extractGabTextEntryFromCommand(cmd) {
        if (!cmd || Number(cmd.code) !== 356) {
            return null;
        }

        const commandLine = Array.isArray(cmd.parameters) ? String(cmd.parameters[0] || '') : '';
        return this.extractGabTextEntryFromCommandLine(commandLine);
    }

    collectCommonEventGabEntries(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
            const commonEvent = $dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectGabTextEntriesFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                output
            );
        }
    }

    collectTroopGabEntries(output) {
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

                this.collectGabTextEntriesFromList(
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

    collectGabTextEntriesFromMapEvent(event, mapId, eventIdx, output) {
        if (!event || !Array.isArray(event.pages)) {
            return;
        }

        for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
            const page = event.pages[pageIdx];
            if (!page || !Array.isArray(page.list)) {
                continue;
            }

            this.collectGabTextEntriesFromList(
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

    collectGabTextEntriesFromMapData(mapData, mapId, output) {
        if (!mapData || !Array.isArray(mapData.events)) {
            return;
        }

        for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
            this.collectGabTextEntriesFromMapEvent(
                mapData.events[eventIdx],
                mapId,
                eventIdx,
                output
            );
        }
    }

    async collectMapGabEntries(output) {
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                this.collectGabTextEntriesFromMapData(mapData, mapId, output);
            } catch (error) {
                console.warn(`[YepGabWindowTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    resolveCachedGabText(sourceText, runtime) {
        if (!this.isUsableText(sourceText) || !runtime) {
            return null;
        }

        const cacheKey = runtime.getCacheKey(sourceText, this.getCacheType());
        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return null;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return this.isUsableText(cached) ? cached : null;
    }

    collectGabTextEntriesFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            const entry = this.extractGabTextEntryFromCommand(cmd);
            if (!entry) {
                continue;
            }

            output.push({
                text: entry.text,
                commandName: entry.commandName,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });
        }
    }

    enablePluginTranslation() {
        const WindowGab = window.Window_Gab;
        if (typeof WindowGab?.prototype?.processNewGabData !== 'function') {
            return false;
        }

        const originalProcessNewGabData = WindowGab.prototype.processNewGabData;
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const resolveCachedGabText = this.resolveCachedGabText.bind(this);

        WindowGab.prototype.processNewGabData = function () {
            originalProcessNewGabData.apply(this, arguments);

            try {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return;
                }

                const sourceText = typeof this._text === 'string' ? this._text : '';
                const cached = resolveCachedGabText(sourceText, runtime);
                if (isUsableText(cached)) {
                    this._text = cached;
                }
            } catch (error) {
                console.warn('[YepGabWindowTranslator] Failed to apply runtime gab translation', error);
            }
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
                console.warn('[YepGabWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        this.collectCommonEventGabEntries(entries);
        this.collectTroopGabEntries(entries);
        await this.collectMapGabEntries(entries);

        return entries;
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
                    id: `plugin_yep_gab_window_${byCacheKey.size}`,
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