import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

/**
 * EventSelector translator
 *
 * Plugin: EventSelector.js
 * Supported versions:
 * - MV (Yoji Ojima): common-event selector window and EventSelector plugin commands.
 *
 * Notes:
 * - Translatable payload is the selected common-event display name shown in
 *   `Window_EventSelector`.
 * - Source references are collected from MV command356 lines:
 *   `EventSelector add <commonEventId>`.
 * - Command/action tokens (`EventSelector`, `add`, `remove`, `open`, `clear`) are never translated.
 */

const CACHE_TYPE = 'plugin_event_selector';
const COMMON_EVENT_NAME_CACHE_TYPE = 'common_event_name';
const HOOK_FLAG = '__CHEAT_EVENT_SELECTOR_TRANSLATOR_HOOKED__';

function parseEventSelectorAddCommand(commandLine) {
    const line = typeof commandLine === 'string' ? commandLine : '';
    if (!line.trim()) {
        return null;
    }

    // Mirror MV command356 parser behavior: split by regular space.
    const parts = line.split(' ');
    const commandName = String(parts.shift() || '')
        .trim()
        .toLowerCase();
    if (commandName !== 'eventselector') {
        return null;
    }

    const action = String(parts.shift() || '')
        .trim()
        .toLowerCase();
    if (action !== 'add') {
        return null;
    }

    const commonEventId = Number(parts[0]);
    if (!Number.isFinite(commonEventId) || commonEventId <= 0) {
        return null;
    }

    return {
        commonEventId,
    };
}

function getCommonEventName(commonEventId) {
    const commonEvent = globalThis.$dataCommonEvents?.[commonEventId];
    return typeof commonEvent?.name === 'string' ? commonEvent.name : '';
}

export class EventSelectorTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'EventSelector';
    }

    getPluginLabel() {
        return 'EventSelector';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    translateEventName(name, runtime) {
        return this.resolveRuntimeTranslation(
            name,
            runtime,
            [this.getCacheType(), COMMON_EVENT_NAME_CACHE_TYPE],
            {
                requireRuntimeTranslationActive: true,
                missValue: name,
            }
        );
    }

    enablePluginTranslation() {
        if (!Game_System.prototype.eventSelectorData) {
            return false;
        }

        const self = this;

        const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
        Scene_Map.prototype.createAllWindows = function () {
            _Scene_Map_createAllWindows.call(this);
            const windowProto = this._eventSelectorWindow.constructor?.prototype;

            if (!windowProto || typeof windowProto.drawItem !== 'function') {
                console.warn(
                    '[EventSelectorTranslator] Window_EventSelector not found, translation disabled',
                    window.Window_EventSelector?.prototype,
                    windowProto?.drawItem,
                    Scene_Map.prototype.createAllWindows
                );
                return false;
            }

            if (windowProto[HOOK_FLAG]) {
                return true;
            }

            const originalDrawItem = windowProto.drawItem;
            const getRuntime = self.getRuntime.bind(self);
            const isRuntimeTranslationActive = self.isRuntimeTranslationActive.bind(self);
            const isUsableText = self.isUsableText.bind(self);
            const translateEventName = self.translateEventName.bind(self);

            windowProto.drawItem = function (index) {
                const runtime = getRuntime();
                if (!isRuntimeTranslationActive(runtime)) {
                    return originalDrawItem.call(this, index);
                }

                const list = Array.isArray(this._list) ? this._list : null;
                const entry = list ? list[index] : null;
                const sourceName = typeof entry?.name === 'string' ? entry.name : '';
                if (!isUsableText(sourceName)) {
                    return originalDrawItem.call(this, index);
                }

                const translatedName = translateEventName(sourceName, runtime);
                if (translatedName === sourceName) {
                    return originalDrawItem.call(this, index);
                }

                entry.name = translatedName;
                try {
                    return originalDrawItem.call(this, index);
                } finally {
                    entry.name = sourceName;
                }
            };

            windowProto[HOOK_FLAG] = true;
            return true;
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
                console.warn('[EventSelectorTranslator] Scan failed', error);
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

    collectCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const command = list[cmdIdx];
            if (!command || Number(command.code) !== 356) {
                continue;
            }

            const commandLine =
                Array.isArray(command.parameters) && typeof command.parameters[0] === 'string'
                    ? command.parameters[0]
                    : '';
            const parsed = parseEventSelectorAddCommand(commandLine);
            if (!parsed) {
                continue;
            }

            const eventName = getCommonEventName(parsed.commonEventId);
            if (!this.isUsableText(eventName)) {
                continue;
            }

            output.push({
                text: eventName,
                source: {
                    ...baseMeta,
                    cmdIdx,
                    commonEventId: parsed.commonEventId,
                },
            });
        }
    }

    collectCommonEventEntries(output) {
        if (!Array.isArray(globalThis.$dataCommonEvents)) {
            return;
        }

        for (
            let commonEventId = 0;
            commonEventId < globalThis.$dataCommonEvents.length;
            commonEventId++
        ) {
            const commonEvent = globalThis.$dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectCommandsFromList(
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

                this.collectCommandsFromList(
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
                const mapData = await loadMapDataById(mapId);
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                this.collectMapEventEntries(mapData.events, mapId, output);
            } catch (error) {
                console.warn(`[EventSelectorTranslator] Failed to scan map ${mapId}`, error);
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

            this.collectCommandsFromList(
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

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry?.text === 'string' ? entry.text : '';
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (byCacheKey.has(cacheKey)) {
                continue;
            }

            byCacheKey.set(cacheKey, {
                type: this.getCacheType(),
                id: `plugin_event_selector_${byCacheKey.size}`,
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
