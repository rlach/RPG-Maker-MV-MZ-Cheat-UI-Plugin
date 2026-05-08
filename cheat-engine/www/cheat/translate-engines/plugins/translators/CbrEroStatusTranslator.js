import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../panels/translate-on-the-fly/ObjectTranslationModalMethods.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_CBR_ERO_STATUS_TRANSLATOR_HOOKED__';
const PLUGIN_SCRIPT_HEADER = 'CBR-エロステータス';
const TEXT_LINE_PREFIX = 'テキスト-';

function readCommandLine(cmd) {
    return Array.isArray(cmd && cmd.parameters) && typeof cmd.parameters[0] === 'string'
        ? cmd.parameters[0]
        : '';
}

function isCbrEroStatusScriptHeader(line) {
    return String(line || '').trim() === PLUGIN_SCRIPT_HEADER;
}

function extractTextPayloadFromDataLine(line) {
    const safeLine = String(line || '');
    if (!safeLine.startsWith(TEXT_LINE_PREFIX)) {
        return null;
    }

    return safeLine.slice(TEXT_LINE_PREFIX.length);
}

function buildTranslatedDataLine(line, translator, runtime, cacheType) {
    const payload = extractTextPayloadFromDataLine(line);
    if (!translator.isUsableText(payload)) {
        return line;
    }

    if (!runtime) {
        return line;
    }

    const cacheKey = runtime.getCacheKey(payload, cacheType);
    runtime.trackCacheKeyUsage(cacheKey);

    if (!runtime.hasUsableCacheValue(cacheKey)) {
        return line;
    }

    const cached = runtime.translationCache.get(cacheKey);
    if (!translator.isUsableText(cached)) {
        return line;
    }

    return `${TEXT_LINE_PREFIX}${cached}`;
}

export class CbrEroStatusTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'CBR_EroStatus';
    }

    getPluginLabel() {
        return 'CBR EroStatus';
    }

    getCacheType() {
        return 'plugin_cbr_ero_status';
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (
            !window.CBR ||
            typeof window.CBR !== 'object' ||
            typeof window.CBR['エロステータス'] !== 'function'
        ) {
            return;
        }

        const original = window.CBR['エロステータス'];
        const cacheType = this.getCacheType();
        const translator = this;

        window.CBR['エロステータス'] = function (ary) {
            try {
                const runtime = translator.getRuntime();
                if (Array.isArray(ary) && runtime) {
                    arguments[0] = ary.map((line) =>
                        buildTranslatedDataLine(line, translator, runtime, cacheType)
                    );
                }
            } catch (error) {
                console.warn(
                    '[CbrEroStatusTranslator] Failed to apply runtime CBR_EroStatus translation',
                    error
                );
            }

            return original.apply(this, arguments);
        };

        window[RUNTIME_HOOK_GUARD] = true;
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
                console.warn('[CbrEroStatusTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectFromCommandList(
                    commonEvent.list,
                    {
                        scope: 'commonEvent',
                        commonEventId,
                    },
                    entries
                );
            }
        }

        if (Array.isArray(window.$dataTroops)) {
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

                    this.collectFromCommandList(
                        page.list,
                        {
                            scope: 'troopEvent',
                            troopId,
                            pageIdx,
                        },
                        entries
                    );
                }
            }
        }

        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo && mapInfo.id);
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

                        this.collectFromCommandList(
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
            } catch (error) {
                console.warn(`[CbrEroStatusTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectFromCommandList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 355) {
                continue;
            }

            const headerLine = readCommandLine(cmd);
            if (!isCbrEroStatusScriptHeader(headerLine)) {
                continue;
            }

            let continuationIdx = cmdIdx + 1;
            while (
                continuationIdx < list.length &&
                list[continuationIdx] &&
                Number(list[continuationIdx].code) === 655
            ) {
                const dataLine = readCommandLine(list[continuationIdx]);
                const payload = extractTextPayloadFromDataLine(dataLine);
                if (this.isUsableText(payload)) {
                    output.push({
                        text: payload,
                        source: {
                            ...baseMeta,
                            scriptCmdIdx: cmdIdx,
                            dataCmdIdx: continuationIdx,
                        },
                    });
                }

                continuationIdx += 1;
            }

            cmdIdx = continuationIdx - 1;
        }
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_cbr_ero_status_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel) {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel) {
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
