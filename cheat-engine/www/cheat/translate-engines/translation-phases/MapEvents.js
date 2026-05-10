import { BasePhase } from './BasePhase.js';
import {
    collectEventCommandEntries,
    countEventCommandEntries,
} from '../../js/EventCommandTraversal.js';
import { loadMapDataById } from '../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { normalizeMessageEntryForPlugins } from '../plugins/PluginMessageEntryNormalizer.js';

export class MapEvents extends BasePhase {
    static getInstance() {
        if (!MapEvents._instance) {
            MapEvents._instance = new MapEvents();
        }
        return MapEvents._instance;
    }

    constructor(mapData = null, mapNumber = null, totalMaps = null, progressLabel = null) {
        super();
        this.configure(mapData, mapNumber, totalMaps, progressLabel);
    }

    configure(mapData = null, mapNumber = null, totalMaps = null, progressLabel = null) {
        this.mapData = mapData;
        this.mapNumber = mapNumber;
        this.totalMaps = totalMaps;
        this.progressLabel = progressLabel;
        return this;
    }

    static countEventCommandListStats(runtime, list = []) {
        return countEventCommandEntries(list, {
            transformEntry(entry) {
                return normalizeMessageEntryForPlugins(runtime, entry);
            },
            isUntranslated(entry) {
                return !runtime.hasUsableCacheValue(runtime.getCacheKey(entry.value, entry.type));
            },
        });
    }

    static countMapEventStatsForData(runtime, mapData) {
        if (!mapData || !Array.isArray(mapData.events)) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        let totalStrings = 0;
        let leftStrings = 0;

        for (const event of mapData.events) {
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            for (const page of event.pages) {
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                const stats = MapEvents.countEventCommandListStats(runtime, page.list);
                totalStrings += stats.totalStrings;
                leftStrings += stats.leftStrings;
            }
        }

        return {
            total: totalStrings > 0 ? 1 : 0,
            left: leftStrings > 0 ? 1 : 0,
            totalStrings,
            leftStrings,
        };
    }

    getTranslationPhaseLabel() {
        return (
            this.progressLabel ||
            (this.mapNumber !== null && this.totalMaps !== null
                ? `translating map ${this.mapNumber}/${this.totalMaps}`
                : 'translating map')
        );
    }

    getKind() {
        return 'mapEvents';
    }

    async createEntries({ request, runtime }) {
        if (request.mapData) {
            return [
                {
                    priorityMapId: Number(request.mapId) || 0,
                    strategy: this.configure(
                        request.mapData,
                        request.mapNumber || null,
                        request.totalMaps || null,
                        request.progressLabel || 'translating map'
                    ),
                },
            ];
        }

        const validMaps = runtime.getValidMapInfos();
        const selectedIds = Array.isArray(request.mapIds)
            ? request.mapIds.map((id) => Number(id)).filter(Boolean)
            : runtime.getSelectedObjectTranslationMapIds(validMaps);
        const selectedIdSet = new Set(selectedIds);
        const mapsToTranslate = validMaps.filter((mapInfo) =>
            selectedIdSet.has(Number(mapInfo.id))
        );

        return mapsToTranslate.map((mapInfo, mapIndex) => {
            const mapNumber = mapIndex + 1;
            const totalMaps = mapsToTranslate.length;
            return {
                priorityMapId: Number(mapInfo.id) || 0,
                createStrategy: async () => {
                    const mapData = await loadMapDataById(mapInfo.id);
                    return this.configure(
                        mapData,
                        mapNumber,
                        totalMaps,
                        `translating map ${mapNumber}/${totalMaps}`
                    );
                },
            };
        });
    }

    countAmountSync({ request, runtime }) {
        const validMaps = runtime.getValidMapInfos();
        const selectedIds = Array.isArray(request.mapIds)
            ? request.mapIds.map((id) => Number(id)).filter(Boolean)
            : runtime.getSelectedObjectTranslationMapIds(validMaps);
        const total = selectedIds.length;
        return { total, left: total, totalStrings: 0, leftStrings: 0 };
    }

    collectUntranslated({ runtime }) {
        const dataMap = this.mapData || window.$dataMap;
        if (!dataMap || !Array.isArray(dataMap.events)) {
            return [];
        }

        const itemsToTranslate = [];
        let runningCounter = 0;

        for (let eventIdx = 0; eventIdx < dataMap.events.length; eventIdx++) {
            const event = dataMap.events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                const page = event.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                const entries = collectEventCommandEntries(page.list, {
                    transformEntry(entry) {
                        return normalizeMessageEntryForPlugins(runtime, entry);
                    },
                });
                for (const entry of entries) {
                    const cacheKey = runtime.getCacheKey(entry.value, entry.type);
                    if (runtime.hasUsableCacheValue(cacheKey)) {
                        continue;
                    }

                    itemsToTranslate.push({
                        type: entry.type,
                        id: `map_${eventIdx}_${pageIdx}_${entry.type}_${runningCounter++}`,
                        value: entry.value,
                        cacheKey,
                        eventIdx,
                        pageIdx,
                        cmdIdx: entry.cmdIndex,
                    });
                }
            }
        }

        return Array.from(new Map(itemsToTranslate.map((item) => [item.cacheKey, item])).values());
    }
}
