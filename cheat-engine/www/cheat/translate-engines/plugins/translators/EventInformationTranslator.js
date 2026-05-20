import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

/**
 * EventInformation.js translator
 *
 * Supported plugin:
 * - EventInformation.js v1.1.0 (MV)
 *
 * Notes:
 * - Collects text from leading comment blocks (code 108/408) in map event pages and common events.
 * - Parses `info:` directives only and preserves command prefixes/literals (`info`, `infoMove`).
 * - Runtime hook patches `_PD_EventInfomation.convertEscapeCharacters` so cached translations resolve
 *   against the original source payload before variable escape conversion runs.
 */
export class EventInformationTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'EventInformation';
    }

    getPluginLabel() {
        return 'EventInformation';
    }

    getCacheType() {
        return 'plugin_event_information';
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
                console.warn('[EventInformationTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this.collectCommonEventEntries(entries);
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

            this.collectInfoEntriesFromLeadingComments(
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
                this.collectMapDataEntries(mapData, mapId, output);
            } catch (error) {
                console.warn(`[EventInformationTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    collectMapDataEntries(mapData, mapId, output) {
        if (!mapData || !Array.isArray(mapData.events)) {
            return;
        }

        for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
            const event = mapData.events[eventIdx];
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

            this.collectInfoEntriesFromLeadingComments(
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

    collectInfoEntriesFromLeadingComments(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        let index = 0;
        while (index < list.length) {
            const cmd = list[index];
            const code = Number(cmd?.code);
            if (code !== 108 && code !== 408) {
                break;
            }

            const commentText = String(cmd?.parameters?.[0] || '');
            const tokens = commentText.toLowerCase().replaceAll('　', ' ').split(' ');

            for (const token of tokens) {
                const params = token.replaceAll(':', ',').replaceAll('：', ',').split(',');
                if (params[0] !== 'info') {
                    continue;
                }

                const text = String(params[1] || '');
                if (!this.isUsableText(text)) {
                    continue;
                }

                output.push({
                    text,
                    source: {
                        ...baseMeta,
                        cmdIdx: index,
                    },
                });
            }

            index += 1;
        }
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
                    id: `plugin_event_information_${byCacheKey.size}`,
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

    enablePluginTranslation() {
        const eventInformation = globalThis._PD_EventInfomation;
        if (!eventInformation || typeof eventInformation !== 'function') {
            console.log(
                '[EventInformationTranslator] Plugin global object not found, cannot enable translation'
            );
            return false;
        }

        if (typeof eventInformation.convertEscapeCharacters !== 'function') {
            console.log(
                '[EventInformationTranslator] Plugin method to patch not found, cannot enable translation'
            );
            return false;
        }

        const originalConvertEscapeCharacters = eventInformation.convertEscapeCharacters;
        const applyRuntimeTranslation = (text) => {
            const runtime = this.getRuntime();
            const sourceText = String(text ?? '');

            if (!this.isRuntimeTranslationActive(runtime)) {
                return sourceText;
            }

            return this.resolveRuntimeTranslation(sourceText, runtime, this.getCacheType(), {
                requireRuntimeTranslationActive: true,
            });
        };

        eventInformation.convertEscapeCharacters = function (text) {
            const resolvedSourceText = applyRuntimeTranslation(text);
            return originalConvertEscapeCharacters.call(this, resolvedSourceText);
        };

        return true;
    }
}
