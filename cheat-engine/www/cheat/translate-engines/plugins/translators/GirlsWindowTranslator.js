import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

/**
 * GirlsWindow plugin translator.
 *
 * Supported versions:
 * - GirlsWindow Version 1.10 (MV)
 *
 * Notes:
 * - Collects translatable GirlsWindow ID command name arguments from MV plugin commands.
 * - Collects built-in status labels rendered by the plugin window.
 * - Applies runtime cache translation at Window_GirlsStatus.drawText.
 */

const GIRLS_WINDOW_COMMAND = 'GIRLSWINDOW';
const GIRLS_WINDOW_ID_COMMAND = 'ID';

const GIRLS_WINDOW_BUILTIN_TEXTS = [
    ' 好感度 :',
    'Ｈ開発度:',
    '安全日',
    '危険日',
    '生理',
    '妊娠',
    '(旦那の子)',
    '不妊治療中',
    '射精',
];

function toUpperSafe(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

function parseGirlsWindowIdTextFromMvLine(commandLine) {
    const line = String(commandLine || '').trim();
    if (!line) {
        return '';
    }

    const parts = line.split(/\s+/u);
    if (toUpperSafe(parts[0]) !== GIRLS_WINDOW_COMMAND) {
        return '';
    }

    if (toUpperSafe(parts[1]) !== GIRLS_WINDOW_ID_COMMAND) {
        return '';
    }

    return String(parts[2] || '').trim();
}

export class GirlsWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'GirlsWindow';
    }

    getPluginLabel() {
        return 'GirlsWindow';
    }

    getCacheType() {
        return 'plugin_girls_window';
    }

    enablePluginTranslation() {
        if (!window.Scene_Map || !Scene_Map.prototype) {
            return;
        }

        const originalCreateGirlsStatusWindow = Scene_Map.prototype.createGirlsStatusWindow;
        if (typeof originalCreateGirlsStatusWindow !== 'function') {
            return;
        }

        const cacheType = this.getCacheType();
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);

        Scene_Map.prototype.createGirlsStatusWindow = function () {
            const result = originalCreateGirlsStatusWindow.apply(this, arguments);

            const statusWindow = this && this.status_window2;
            if (statusWindow && !statusWindow.__CHEAT_GIRLS_WINDOW_TRANSLATION_HOOKED__) {
                const originalDrawText = statusWindow.drawText;
                if (typeof originalDrawText === 'function') {
                    statusWindow.drawText = function (text) {
                        try {
                            if (!isUsableText(text)) {
                                return originalDrawText.apply(this, arguments);
                            }

                            const runtime = getRuntime();
                            if (!runtime) {
                                return originalDrawText.apply(this, arguments);
                            }

                            const cacheKeys = [runtime.getCacheKey(text, cacheType)];
                            if (text.startsWith(' ')) {
                                const trimmed = text.trimStart();
                                if (isUsableText(trimmed)) {
                                    cacheKeys.push(runtime.getCacheKey(trimmed, cacheType));
                                }
                            }

                            for (const cacheKey of cacheKeys) {
                                runtime.trackCacheKeyUsage(cacheKey);
                            }

                            if (!isRuntimeTranslationActive(runtime)) {
                                return originalDrawText.apply(this, arguments);
                            }

                            for (const cacheKey of cacheKeys) {
                                if (!runtime.hasUsableCacheValue(cacheKey)) {
                                    continue;
                                }

                                const cached = runtime.translationCache.get(cacheKey);
                                if (isUsableText(cached)) {
                                    arguments[0] = cached;
                                    break;
                                }
                            }
                        } catch (error) {
                            console.warn(
                                '[GirlsWindowTranslator] Failed to translate runtime text',
                                error
                            );
                        }

                        return originalDrawText.apply(this, arguments);
                    };

                    Object.defineProperty(statusWindow, '__CHEAT_GIRLS_WINDOW_TRANSLATION_HOOKED__', {
                        value: true,
                        configurable: true,
                        enumerable: false,
                        writable: false,
                    });
                }
            }

            return result;
        };
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
                console.warn('[GirlsWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = GIRLS_WINDOW_BUILTIN_TEXTS.map((text, textIdx) => ({
            text,
            source: {
                scope: 'builtinLiteral',
                textIdx,
            },
        }));

        await this.collectFromCommonEvents(entries);
        await this.collectFromMaps(entries);

        return entries;
    }

    async collectFromCommonEvents(entries) {
        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectGirlsWindowIdTextsFromList(
                    commonEvent.list,
                    {
                        scope: 'commonEvent',
                        commonEventId,
                    },
                    entries
                );
            }
        }
    }

    async collectFromMaps(entries) {
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await loadMapDataById(mapId);
                this.collectFromMapData(mapData, mapId, entries);
            } catch (error) {
                console.warn(`[GirlsWindowTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    collectFromMapData(mapData, mapId, entries) {
        if (!mapData || !Array.isArray(mapData.events)) {
            return;
        }

        for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
            this.collectFromEventPages(mapData.events[eventIdx], mapId, eventIdx, entries);
        }
    }

    collectFromEventPages(event, mapId, eventIdx, entries) {
        if (!event || !Array.isArray(event.pages)) {
            return;
        }

        for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
            const page = event.pages[pageIdx];
            if (!page || !Array.isArray(page.list)) {
                continue;
            }

            this.collectGirlsWindowIdTextsFromList(
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

    collectGirlsWindowIdTextsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
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
            const text = parseGirlsWindowIdTextFromMvLine(commandLine);
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
                    id: `plugin_girls_window_${byCacheKey.size}`,
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