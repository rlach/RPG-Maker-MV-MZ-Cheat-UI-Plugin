import { collectVariableAssignmentEntries } from '../../js/EventCommandTraversal.js';
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

    static getMarkedVariableIdSet(panel) {
        const safeIds = panel ? panel.getSafeVariableTranslationIds() : [];
        return new Set(
            safeIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        );
    }

    static loadMapDataSync(mapId) {
        const safeMapId = Number(mapId) || 0;
        if (safeMapId <= 0) {
            return null;
        }

        try {
            // @ts-ignore Node built-in available in NW.js runtime.
            const fileSystem = require('fs');
            // @ts-ignore Node built-in available in NW.js runtime.
            const pathModule = require('path');
            const fileName = `Map${String(safeMapId).padStart(3, '0')}.json`;
            const filePath = pathModule.resolve('./data', fileName);
            if (!fileSystem.existsSync(filePath)) {
                return null;
            }

            return JSON.parse(fileSystem.readFileSync(filePath, 'utf-8'));
        } catch (error) {
            console.warn(`[Variables] Failed to load map ${safeMapId}`, error);
            return null;
        }
    }

    static collectListEntries(list, allowedVariableIds) {
        return collectVariableAssignmentEntries(list, { allowedVariableIds });
    }

    static collectMapEntries(panel, allowedVariableIds) {
        const entries = [];
        const validMaps = panel ? panel.getValidMapInfos() : [];

        for (const mapInfo of validMaps) {
            const mapData = Variables.loadMapDataSync(mapInfo.id);
            if (!mapData || !Array.isArray(mapData.events)) {
                continue;
            }

            for (const event of mapData.events) {
                if (!event || !Array.isArray(event.pages)) {
                    continue;
                }

                for (const page of event.pages) {
                    if (!page || !Array.isArray(page.list)) {
                        continue;
                    }

                    entries.push(...Variables.collectListEntries(page.list, allowedVariableIds));
                }
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

    static buildScanResult(panel) {
        const allowedVariableIds = Variables.getMarkedVariableIdSet(panel);
        if (allowedVariableIds.size === 0) {
            return Variables.createEmptyScanResult();
        }

        const allEntries = [
            ...Variables.collectCommonEventEntries(allowedVariableIds),
            ...Variables.collectTroopEntries(allowedVariableIds),
            ...Variables.collectMapEntries(panel, allowedVariableIds),
        ];

        const uniqueItemsMap = new Map();
        for (const entry of allEntries) {
            if (!entry || typeof entry.value !== 'string' || entry.value.trim() === '') {
                continue;
            }

            const cacheKey = panel.getCacheKey(entry.value, VARIABLE_VALUE_CACHE_TYPE);
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
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
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

    getKind() {
        return 'variables';
    }

    getTranslationPhaseLabel() {
        return 'translating variables';
    }

    async createEntries({ panel }) {
        const scanResult = Variables.buildScanResult(panel);
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

    countAmountSync({ panel }) {
        const scanResult = Variables.buildScanResult(panel);
        return {
            total: scanResult.total,
            left: scanResult.left,
            totalStrings: scanResult.totalStrings,
            leftStrings: scanResult.leftStrings,
        };
    }

    collectUntranslated() {
        return Array.isArray(this.scanResult?.pendingItems) ? this.scanResult.pendingItems : [];
    }
}

/** @type {Variables|null} */
Variables._instance = null;
