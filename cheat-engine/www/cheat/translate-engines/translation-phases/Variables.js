import { collectVariableAssignmentEntries } from '../../js/EventCommandTraversal.js';
import { loadMapDataById } from '../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { BasePhase } from './BasePhase.js';

const VARIABLE_VALUE_CACHE_TYPE = 'variable_value';

export class Variables extends BasePhase {
    static getInstance() {
        if (!Variables._instance) {
            Variables._instance = new Variables();
        }
        return Variables._instance;
    }

    constructor(scanResult = null) {
        super();
        this.configure(scanResult);
    }

    /**
     * @param {any} scanResult
     */
    configure(scanResult = null) {
        const safeScanResult = scanResult || Variables.createEmptyScanResult();
        this.scanResult = safeScanResult;
        return this;
    }

    static createEmptyScanResult() {
        return {
            total: 0,
            left: 0,
            totalStrings: 0,
            leftStrings: 0,
            uniqueItems: [],
            pendingItems: [],
        };
    }

    static getMarkedVariableIdSet(runtime) {
        const safeIds = runtime ? runtime.getSafeVariableTranslationIds() : [];
        return new Set(safeIds.map(Number).filter((id) => Number.isInteger(id) && id > 0));
    }

    static countMarkedVariables(runtime) {
        return Variables.getMarkedVariableIdSet(runtime).size;
    }

    static collectListEntries(list, allowedVariableIds) {
        return collectVariableAssignmentEntries(list, { allowedVariableIds });
    }

    static collectMapPageEntries(entries, event, allowedVariableIds) {
        if (!event || !Array.isArray(event.pages)) {
            return;
        }

        for (const page of event.pages) {
            if (!page || !Array.isArray(page.list)) {
                continue;
            }

            entries.push(...Variables.collectListEntries(page.list, allowedVariableIds));
        }
    }

    static async collectMapEntries(runtime, allowedVariableIds) {
        const entries = [];
        const validMaps = runtime ? runtime.getValidMapInfos() : [];

        for (const mapInfo of validMaps) {
            let mapData = null;
            try {
                mapData = await loadMapDataById(mapInfo.id);
            } catch (error) {
                console.warn(`[Variables] Failed to load map ${mapInfo.id}`, error);
            }

            if (!mapData || !Array.isArray(mapData.events)) {
                continue;
            }

            for (const event of mapData.events) {
                Variables.collectMapPageEntries(entries, event, allowedVariableIds);
            }
        }

        return entries;
    }

    static collectCommonEventEntries(allowedVariableIds) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return [];
        }

        const entries = [];
        for (const event of $dataCommonEvents) {
            if (!event || !Array.isArray(event.list)) {
                continue;
            }

            entries.push(...Variables.collectListEntries(event.list, allowedVariableIds));
        }

        return entries;
    }

    static collectTroopEntries(allowedVariableIds) {
        if (!Array.isArray(window.$dataTroops)) {
            return [];
        }

        const entries = [];
        for (const troop of $dataTroops) {
            if (!troop || !Array.isArray(troop.pages)) {
                continue;
            }

            for (const page of troop.pages) {
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                entries.push(...Variables.collectListEntries(page.list, allowedVariableIds));
            }
        }

        return entries;
    }

    static mergeEntriesIntoUniqueItems(runtime, allEntries) {
        const uniqueItemsMap = new Map();
        for (const entry of allEntries) {
            if (!entry || typeof entry.value !== 'string' || entry.value === '') {
                continue;
            }

            const cacheKey = runtime.getCacheKey(entry.value, VARIABLE_VALUE_CACHE_TYPE);
            if (!uniqueItemsMap.has(cacheKey)) {
                uniqueItemsMap.set(cacheKey, {
                    type: VARIABLE_VALUE_CACHE_TYPE,
                    id: `variable_value_${uniqueItemsMap.size}`,
                    value: entry.value,
                    cacheKey,
                    variableIds: Array.isArray(entry.variableIds) ? [...entry.variableIds] : [],
                });
                continue;
            }

            const existing = uniqueItemsMap.get(cacheKey);
            const combinedIds = new Set([
                ...(Array.isArray(existing.variableIds) ? existing.variableIds : []),
                ...(Array.isArray(entry.variableIds) ? entry.variableIds : []),
            ]);
            existing.variableIds = Array.from(combinedIds).sort((a, b) => a - b);
        }

        const uniqueItems = Array.from(uniqueItemsMap.values());
        const pendingItems = uniqueItems.filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        );

        return {
            total: uniqueItems.length,
            left: pendingItems.length,
            totalStrings: uniqueItems.length,
            leftStrings: pendingItems.length,
            uniqueItems,
            pendingItems,
        };
    }

    static async buildScanResult(runtime) {
        const allowedVariableIds = Variables.getMarkedVariableIdSet(runtime);
        if (allowedVariableIds.size === 0) {
            return Variables.createEmptyScanResult();
        }

        const allEntries = [
            ...Variables.collectCommonEventEntries(allowedVariableIds),
            ...Variables.collectTroopEntries(allowedVariableIds),
            ...(await Variables.collectMapEntries(runtime, allowedVariableIds)),
        ];

        return Variables.mergeEntriesIntoUniqueItems(runtime, allEntries);
    }

    getKind() {
        return 'variables';
    }

    getTranslationPhaseLabel() {
        return 'translating variables';
    }

    async createEntries({ runtime }) {
        const scanResult = await Variables.buildScanResult(runtime);
        if (scanResult.total <= 0) {
            return [];
        }

        return [
            {
                strategy: this.configure(scanResult),
                priorityMapId: 0,
            },
        ];
    }

    countAmountSync({ runtime }) {
        const configuredVariableCount = Variables.countMarkedVariables(runtime);
        return {
            total: configuredVariableCount,
            left: configuredVariableCount,
            totalStrings: configuredVariableCount,
            leftStrings: configuredVariableCount,
        };
    }

    collectUntranslated() {
        return Array.isArray(this.scanResult?.pendingItems) ? this.scanResult.pendingItems : [];
    }
}

/** @type {Variables|null} */
Variables._instance = null;
