import { TRANSLATE_SETTINGS, TRANSLATOR } from '../../js/TranslateHelper.js';
import { countEventCommandEntries } from '../../js/EventCommandTraversal.js';
import { createTranslationBatchManager } from '../../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../../translate-engines/plugins/PluginTranslatorRegistry.js';
import {
    getSystemMessageCacheKey,
    getSystemMessagesSource,
} from '../../translate-engines/translation-phases/SystemMessageCacheRules.js';

const DEFAULT_OBJECT_TRANSLATION_TYPE_DEFS = Object.freeze([
    { id: 'mapEvents', label: 'Map events' },
    { id: 'commonEvents', label: 'CommonEvents' },
    { id: 'variables', label: 'Variables (setup in variables panel)' },
    { id: 'items', label: 'items' },
    { id: 'skills', label: 'skills' },
    { id: 'classes', label: 'classes' },
    { id: 'enemies', label: 'enemies' },
    { id: 'armors', label: 'armors' },
    { id: 'weapons', label: 'weapons' },
    { id: 'maps', label: 'Map names' },
    { id: 'actors', label: 'actors' },
    { id: 'systemMessages', label: 'system messages' },
    { id: 'systemCommands', label: 'system commands' },
    { id: 'otherStrings', label: 'other strings' },
    { id: 'gameArrays', label: 'game arrays (terms, types, elements)' },
    { id: 'troops', label: 'Troops' },
    { id: 'plugins', label: 'Plugins' },
    { id: 'cacheEmptyStrings', label: 'Translate all empty strings in cache (including previous errors)', noDragDrop: true },
]);

export function loadMapDataById(mapId) {
    return new Promise((resolve, reject) => {
        const safeMapId = Number(mapId) || 0;
        if (safeMapId <= 0) {
            reject(new Error('Invalid map id'));
            return;
        }

        const filename = `Map${String(safeMapId).padStart(3, '0')}.json`;
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `data/${filename}`, true);
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (error) {
                    reject(error);
                }
                return;
            }

            reject(new Error(`HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send();
    });
}

export const objectTranslationRuntimeMethods = {
    getDefaultObjectTranslationTypeDefs() {
        return DEFAULT_OBJECT_TRANSLATION_TYPE_DEFS.map((item) => ({ ...item }));
    },

    getObjectTranslationTypeOrder() {
        const defaults = this.getDefaultObjectTranslationTypeDefs();
        const draggableIds = defaults.filter((e) => !e.noDragDrop).map((e) => e.id);
        const noDragDropIds = defaults.filter((e) => e.noDragDrop).map((e) => e.id);
        const validSet = new Set(draggableIds);

        const requestedIds = Array.isArray(this.objectTranslationTypeOrder)
            ? this.objectTranslationTypeOrder
            : [];

        const ordered = [];
        const seen = new Set();

        for (const rawId of requestedIds) {
            const id = String(rawId || '').trim();
            if (!id || !validSet.has(id) || seen.has(id)) {
                continue;
            }
            ordered.push(id);
            seen.add(id);
        }

        for (const id of draggableIds) {
            if (!seen.has(id)) {
                ordered.push(id);
            }
        }

        // noDragDrop items always appended after draggable ones
        for (const id of noDragDropIds) {
            ordered.push(id);
        }

        this.objectTranslationTypeOrder = ordered.filter((id) => !noDragDropIds.includes(id));
        return ordered;
    },

    setObjectTranslationTypeOrder(orderIds = [], options = {}) {
        const persist = !options || options.persist !== false;
        const defaults = this.getDefaultObjectTranslationTypeDefs();
        const draggableIds = defaults.filter((e) => !e.noDragDrop).map((e) => e.id);
        const validSet = new Set(draggableIds);

        const requestedIds = Array.isArray(orderIds) ? orderIds : [];
        const next = [];
        const seen = new Set();

        for (const rawId of requestedIds) {
            const id = String(rawId || '').trim();
            if (!id || !validSet.has(id) || seen.has(id)) {
                continue;
            }
            next.push(id);
            seen.add(id);
        }

        for (const id of draggableIds) {
            if (!seen.has(id)) {
                next.push(id);
            }
        }

        this.objectTranslationTypeOrder = next;
        if (persist) {
            this.saveSettings();
        }
        return next;
    },

    getObjectTranslationTypeDefs() {
        const defaults = this.getDefaultObjectTranslationTypeDefs();
        const byId = new Map(defaults.map((entry) => [entry.id, entry]));
        const orderedIds = this.getObjectTranslationTypeOrder();

        return orderedIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .map((entry) => ({ ...entry }));
    },

    getValidMapInfos() {
        if (!window.$dataMapInfos || !Array.isArray($dataMapInfos)) {
            return [];
        }

        const validMaps = [];
        for (let i = 0; i < $dataMapInfos.length; i++) {
            const mapInfo = $dataMapInfos[i];
            if (mapInfo && mapInfo.id) {
                validMaps.push({
                    id: mapInfo.id,
                    name: mapInfo.name || `Map ${mapInfo.id}`,
                });
            }
        }

        return validMaps;
    },

    countCommonEventsStats() {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        let total = 0;
        let left = 0;

        for (const entry of $dataCommonEvents) {
            if (!entry || !Array.isArray(entry.list)) {
                continue;
            }

            const stats = countEventCommandEntries(entry.list, {
                isUntranslated: (item) =>
                    !this.hasUsableCacheValue(this.getCacheKey(item.value, item.type)),
            });
            total += stats.totalStrings;
            left += stats.leftStrings;
        }

        return { total, left, totalStrings: total, leftStrings: left };
    },

    countMapEventsStats() {
        const validMaps = this.getValidMapInfos();
        const totalMaps = validMaps.length;
        return {
            total: totalMaps,
            left: totalMaps,
            totalStrings: 0,
            leftStrings: 0,
        };
    },

    countEventCommandListStats(list = []) {
        return countEventCommandEntries(list, {
            isUntranslated: (item) =>
                !this.hasUsableCacheValue(this.getCacheKey(item.value, item.type)),
        });
    },

    countMapEventStatsForData(mapData) {
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

                const stats = this.countEventCommandListStats(page.list);
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
    },

    /**
     * @param {Array<{id:number,name:string}>|null} validMaps
     * @returns {number[]}
     */
    getSelectedObjectTranslationMapIds(validMaps = null) {
        const safeMaps = Array.isArray(validMaps) ? validMaps : this.getValidMapInfos();
        const validIds = safeMaps.map((mapInfo) => Number(mapInfo.id)).filter(Boolean);

        if (!Array.isArray(this.objectTranslationSelectedMapIds)) {
            this.objectTranslationSelectedMapIds = validIds.slice();
        }

        const selectedSet = new Set(
            (this.objectTranslationSelectedMapIds || []).map((id) => Number(id)).filter(Boolean)
        );
        const sanitizedIds = validIds.filter((id) => selectedSet.has(id));
        this.objectTranslationSelectedMapIds = sanitizedIds;
        return sanitizedIds.slice();
    },

    getObjectTranslationMapEventsMetaText(totalMaps, selectedMapCount) {
        const safeTotal = Math.max(0, Number(totalMaps) || 0);
        const safeSelected = Math.max(0, Number(selectedMapCount) || 0);

        if (safeSelected > 0 && safeSelected < safeTotal) {
            return `${safeSelected} of ${safeTotal} maps`;
        }

        return `${safeTotal} maps`;
    },

    getEnabledPluginTranslators() {
        if (
            !this.enabledPluginTranslators ||
            typeof this.enabledPluginTranslators !== 'object' ||
            Array.isArray(this.enabledPluginTranslators)
        ) {
            this.enabledPluginTranslators = {};
        }

        return this.enabledPluginTranslators;
    },

    isPluginTranslatorEnabled(pluginName) {
        const key = String(pluginName || '').trim();
        if (!key) {
            return false;
        }

        const enabledMap = this.getEnabledPluginTranslators();
        if (!Object.prototype.hasOwnProperty.call(enabledMap, key)) {
            return true;
        }

        return !!enabledMap[key];
    },

    setPluginTranslatorEnabled(pluginName, enabled, options = {}) {
        const key = String(pluginName || '').trim();
        if (!key) {
            return;
        }

        const persist = !options || options.persist !== false;
        const next = {
            ...this.getEnabledPluginTranslators(),
            [key]: !!enabled,
        };
        this.enabledPluginTranslators = next;

        if (persist) {
            this.saveSettings();
        }
    },

    getObjectTranslationPluginsMetaText(totalPlugins, selectedPluginsCount) {
        const safeTotal = Math.max(0, Number(totalPlugins) || 0);
        const safeSelected = Math.max(0, Number(selectedPluginsCount) || 0);

        if (safeTotal <= 0) {
            return '0 plugins';
        }

        if (safeSelected > 0 && safeSelected < safeTotal) {
            return `${safeSelected} of ${safeTotal} plugins`;
        }

        return `${safeTotal} plugins`;
    },

    async buildObjectTranslationPluginDetails() {
        await PLUGIN_TRANSLATOR_REGISTRY.ensureDetectionCompleted({ runtime: this });

        const summaries = PLUGIN_TRANSLATOR_REGISTRY.getDetectedPluginSummaries(this);
        const details = summaries
            .map((summary) => ({
                id: summary.pluginName,
                label: summary.label || summary.pluginName,
                total: summary.total,
                left: summary.left,
                totalStrings: summary.totalStrings,
                leftStrings: summary.leftStrings,
                selected: this.isPluginTranslatorEnabled(summary.pluginName),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        for (const detail of details) {
            if (
                !Object.prototype.hasOwnProperty.call(this.getEnabledPluginTranslators(), detail.id)
            ) {
                this.setPluginTranslatorEnabled(detail.id, true, { persist: false });
            }
        }

        return details;
    },

    async getTranslatedMapNames(validMaps) {
        const safeMaps = Array.isArray(validMaps) ? validMaps : [];
        const rawNames = safeMaps.map((mapInfo) => mapInfo.name || `Map ${mapInfo.id}`);
        let displayNames = rawNames.slice();

        if (TRANSLATE_SETTINGS.isMapTranslateEnabled()) {
            try {
                displayNames = await TRANSLATOR.translateBulk(rawNames);
            } catch (error) {
                console.warn(
                    '[TranslateOnTheFly] Failed to translate map names for object modal:',
                    error
                );
            }
        }

        const lookup = new Map();
        for (let i = 0; i < safeMaps.length; i++) {
            const mapInfo = safeMaps[i];
            lookup.set(mapInfo.id, displayNames[i] || mapInfo.name || `Map ${mapInfo.id}`);
        }

        return lookup;
    },

    async buildObjectTranslationMapEventDetails() {
        const validMaps = this.getValidMapInfos();
        const selectedMapIds = new Set(this.getSelectedObjectTranslationMapIds(validMaps));
        const mapNames = await this.getTranslatedMapNames(validMaps);
        const details = [];

        for (const mapInfo of validMaps) {
            let stats = { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };

            try {
                const mapData = await this.loadMapDataById(mapInfo.id);
                stats = this.countMapEventStatsForData(mapData);
            } catch (error) {
                console.error(
                    `[TranslateOnTheFly] Failed to build map event stats for map ${mapInfo.id}:`,
                    error
                );
            }

            details.push({
                id: mapInfo.id,
                label: mapNames.get(mapInfo.id) || mapInfo.name || `Map ${mapInfo.id}`,
                total: 1,
                left: stats.left,
                totalStrings: stats.totalStrings,
                leftStrings: stats.leftStrings,
                selected: selectedMapIds.has(mapInfo.id),
            });
        }

        return details;
    },

    loadMapDataById(mapId) {
        return loadMapDataById(mapId);
    },

    getObjectTranslationStats() {
        if (!this.batchManager) {
            this.batchManager = createTranslationBatchManager(this);
        }

        const defs = /** @type {Array<{id:string}>} */ (this.getObjectTranslationTypeDefs());
        const countedByKind = new Map(
            this.batchManager
                .countAmountSync(defs.map((def) => ({ kind: def.id })))
                .map((entry) => [entry.kind, entry])
        );

        return defs.map((def) => {
            const counted = countedByKind.get(def.id) || {};
            return {
                ...def,
                total: Math.max(0, Number(counted.total) || 0),
                left: Math.max(0, Number(counted.left) || 0),
                totalStrings: Math.max(0, Number(counted.totalStrings) || 0),
                leftStrings: Math.max(0, Number(counted.leftStrings) || 0),
            };
        });
    },

    countSystemCommandsStats() {
        if (
            !window.$dataSystem ||
            !$dataSystem.terms ||
            !Array.isArray($dataSystem.terms.commands)
        ) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const source = $dataSystem.terms.commandsOriginal || $dataSystem.terms.commands;
        let total = 0;
        let left = 0;
        for (const val of source) {
            if (!val || typeof val !== 'string' || val.trim() === '') continue;
            total++;
            const cacheKey = this.getCacheKey(val, 'command');
            if (!this.hasUsableCacheValue(cacheKey)) {
                left++;
            }
        }

        return { total, left, totalStrings: total, leftStrings: left };
    },

    countSystemMessagesStats() {
        if (
            !window.$dataSystem ||
            !$dataSystem.terms ||
            !$dataSystem.terms.messages ||
            typeof $dataSystem.terms.messages !== 'object'
        ) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const sourceMessages = getSystemMessagesSource();
        if (!sourceMessages) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const keys = Object.keys(sourceMessages || {});

        let total = 0;
        let left = 0;
        for (const key of keys) {
            const value = sourceMessages[key];
            if (typeof value !== 'string' || value.trim() === '') {
                continue;
            }
            total++;
            const cacheKey = getSystemMessageCacheKey(this, key, value);
            if (!this.hasUsableCacheValue(cacheKey)) {
                left++;
            }
        }

        return {
            total,
            left,
            totalStrings: total,
            leftStrings: left,
        };
    },

    getGameArrayDefs() {
        return [
            {
                parent: () => ($dataSystem && $dataSystem.terms) || null,
                prop: 'basic',
                type: 'terms_basic',
            },
            {
                parent: () => ($dataSystem && $dataSystem.terms) || null,
                prop: 'params',
                type: 'terms_params',
            },
            {
                parent: () => ($dataSystem && $dataSystem.terms) || null,
                prop: 'commands',
                type: 'command',
            },
            {
                parent: () => $dataSystem || null,
                prop: 'weaponTypes',
                type: 'weaponType',
            },
            {
                parent: () => $dataSystem || null,
                prop: 'variables',
                type: 'variable',
            },
            { parent: () => $dataSystem || null, prop: 'switches', type: 'switch' },
            {
                parent: () => $dataSystem || null,
                prop: 'skillTypes',
                type: 'skillType',
            },
            {
                parent: () => $dataSystem || null,
                prop: 'equipTypes',
                type: 'equipType',
            },
            {
                parent: () => $dataSystem || null,
                prop: 'elements',
                type: 'element',
            },
            {
                parent: () => $dataSystem || null,
                prop: 'armorTypes',
                type: 'armorType',
            },
        ];
    },

    collectGameArrayCandidates() {
        if (!window.$dataSystem) {
            return { uniqueValues: [], pendingValues: [] };
        }

        const arrays = this.getGameArrayDefs();
        const uniqueValuesMap = new Map();

        for (const entry of arrays) {
            const parentObj = entry.parent();
            if (!parentObj) {
                continue;
            }

            const sourceArr = Array.isArray(parentObj[`${entry.prop}Original`])
                ? parentObj[`${entry.prop}Original`]
                : parentObj[entry.prop];
            if (!Array.isArray(sourceArr)) {
                continue;
            }

            for (const value of sourceArr) {
                if (!value || typeof value !== 'string') {
                    continue;
                }

                const trimmed = value.trim();
                if (!trimmed) {
                    continue;
                }

                if (!uniqueValuesMap.has(trimmed)) {
                    uniqueValuesMap.set(trimmed, {
                        value: trimmed,
                        types: new Set(),
                        cacheKeys: new Set(),
                    });
                }

                const candidate = uniqueValuesMap.get(trimmed);
                candidate.types.add(entry.type);
                candidate.cacheKeys.add(this.getCacheKey(trimmed, entry.type));
            }
        }

        const uniqueValues = Array.from(uniqueValuesMap.values()).map((candidate) => ({
            value: candidate.value,
            types: Array.from(candidate.types),
            cacheKeys: Array.from(candidate.cacheKeys),
        }));

        const pendingValues = uniqueValues.filter((candidate) => {
            return !candidate.cacheKeys.some((cacheKey) => this.hasUsableCacheValue(cacheKey));
        });

        return { uniqueValues, pendingValues };
    },

    countGameArraysStats() {
        if (!window.$dataSystem) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const candidates = this.collectGameArrayCandidates();
        const total = candidates.uniqueValues.length;
        const left = candidates.pendingValues.length;

        return { total, left, totalStrings: total, leftStrings: left };
    },
};
