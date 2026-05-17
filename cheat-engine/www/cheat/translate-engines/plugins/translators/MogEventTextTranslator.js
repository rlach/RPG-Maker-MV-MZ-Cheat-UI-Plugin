import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

const CACHE_TYPE = 'plugin_mog_event_text';
const EVENT_TEXT_PATTERN = /event_text\s*:\s*(.+)/i;

export class MogEventTextTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'MOG_EventText';
    }

    getPluginLabel() {
        return 'MOG_EventText';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    _applyTranslationToCharText(eventInstance, runtime) {
        if (
            !runtime ||
            !Array.isArray(eventInstance._char_text) ||
            eventInstance._char_text.length < 2
        ) {
            return;
        }

        const text = eventInstance._char_text[1];
        if (!this.isUsableText(text)) {
            return;
        }

        const cacheKey = runtime.getCacheKey(text, CACHE_TYPE);

        // Mark cache key as seen for real-time tracking
        runtime.trackCacheKeyUsage(cacheKey);

        // Apply cached translation if runtime translation is active
        if (this.isRuntimeTranslationActive(runtime) && runtime.hasUsableCacheValue(cacheKey)) {
            const cached = runtime.translationCache.get(cacheKey);
            if (typeof cached === 'string' && cached.trim()) {
                eventInstance._char_text[1] = cached;
            }
        }
    }

    enablePluginTranslation() {
        const translator = this;

        if (
            !window.Game_Event ||
            !Game_Event.prototype ||
            typeof Game_Event.prototype.check_event_text !== 'function'
        ) {
            return false;
        }

        const original = Game_Event.prototype.check_event_text;
        Game_Event.prototype.check_event_text = function () {
            // Call original to populate _char_text
            original.call(this);

            try {
                const runtime = translator.getRuntime();
                translator._applyTranslationToCharText(this, runtime);
            } catch (error) {
                console.warn(
                    '[MogEventTextTranslator] Failed to apply cached event text translation',
                    error
                );
            }
        };
        return true;
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
                console.warn('[MogEventTextTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    _scanMapEventsForEventText(mapData, mapId, output) {
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

                this.collectEventTextFromList(
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

    async buildScanEntries() {
        const entries = [];

        // Scan common events
        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectEventTextFromList(
                    commonEvent.list,
                    {
                        scope: 'commonEvent',
                        commonEventId,
                    },
                    entries
                );
            }
        }

        // Scan map events
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = mapInfo?.id;
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                this._scanMapEventsForEventText(mapData, mapId, entries);
            } catch (error) {
                console.warn(
                    `[MogEventTextTranslator] Failed to scan map ${mapId} for MOG_EventText comments`,
                    error
                );
            }
        }

        return entries;
    }

    collectEventTextFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            // Code 108 is comment in RPG Maker
            if (Number(cmd.code) !== 108) {
                continue;
            }

            const commentText = Array.isArray(cmd.parameters)
                ? String(cmd.parameters[0] || '')
                : '';

            const match = EVENT_TEXT_PATTERN.exec(commentText);
            if (!match) {
                continue;
            }

            const text = String(match[1] ?? '').trim();
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });
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
                    id: `plugin_mog_event_text_${byCacheKey.size}`,
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

    countPluginAmountSync({ runtime }) {
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
