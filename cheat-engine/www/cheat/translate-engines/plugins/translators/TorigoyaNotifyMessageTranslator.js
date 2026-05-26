import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

const CACHE_TYPE = 'plugin_torigoya_notify_message';
const RUNTIME_HOOK_GUARD = '__CHEAT_TORIGOYA_NOTIFY_MESSAGE_TRANSLATOR_HOOKED__';

export class TorigoyaNotifyMessageTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'TorigoyaMZ_NotifyMessage';
    }

    getPluginAliases() {
        return [this.getPluginName(), 'TorigoyaMZ_NotifyMessageZ'];
    }

    getPluginLabel() {
        return 'Torigoya NotifyMessage';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    normalizeArgsObject(value) {
        return value && typeof value === 'object' ? value : null;
    }

    translateRuntimeText(text, runtime) {
        if (typeof text !== 'string' || !text.trim()) {
            return text;
        }

        if (!runtime) {
            return text;
        }

        const cacheKey = runtime.getCacheKey(text, this.getCacheType());

        runtime.trackCacheKeyUsage(cacheKey);

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            return text;
        }

        const cached = runtime.translationCache.get(cacheKey);
        return typeof cached === 'string' && cached.trim() ? cached : text;
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return true;
        }

        const notifyWindowClass =
            window.Torigoya?.NotifyMessageZ?.Window || window.Torigoya?.NotifyMessage?.Window;

        if (
            !notifyWindowClass?.prototype ||
            typeof notifyWindowClass.prototype.setup !== 'function'
        ) {
            return false;
        }

        const originalSetup = notifyWindowClass.prototype.setup;
        const getTranslatedText = (text) => this.translateRuntimeText(text, this.getRuntime());

        // setup receives the raw notify item right before rendering.
        // Translating only the message payload here keeps command names untouched.
        notifyWindowClass.prototype.setup = function (notifyItem) {
            try {
                if (typeof notifyItem?.message === 'string' && notifyItem.message.trim()) {
                    notifyItem.message = getTranslatedText(notifyItem.message);
                }
            } catch (error) {
                console.warn(
                    '[TorigoyaNotifyMessageTranslator] Failed to apply cached translation',
                    error
                );
            }

            return originalSetup.call(this, notifyItem);
        };

        window[RUNTIME_HOOK_GUARD] = true;
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
                console.warn('[TorigoyaNotifyMessageTranslator] Scan failed', error);
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

    collectCommonEventEntries(output) {
        if (Array.isArray(window.$dataCommonEvents)) {
            for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
                const commonEvent = $dataCommonEvents[commonEventId];
                if (!commonEvent || !Array.isArray(commonEvent.list)) {
                    continue;
                }

                this.collectNotifyCommandsFromList(
                    commonEvent.list,
                    {
                        scope: 'commonEvent',
                        commonEventId,
                    },
                    output
                );
            }
        }
    }

    collectTroopEntries(output) {
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

                    this.collectNotifyCommandsFromList(
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
                console.warn(
                    `[TorigoyaNotifyMessageTranslator] Failed to scan map ${mapId}`,
                    error
                );
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

            for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                const page = event.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectNotifyCommandsFromList(
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

    collectNotifyCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 357) {
                continue;
            }

            const entry = this.extractMZNotifyEntry(cmd);
            if (!entry?.text?.trim()) {
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

    extractMZNotifyEntry(cmd) {
        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        const pluginName = String(parameters[0] || '').trim();
        const commandName = String(parameters[1] || '').trim();
        const args = this.normalizeArgsObject(parameters[3]);
        const message = args && typeof args.message === 'string' ? args.message : '';

        if (
            pluginName?.toLowerCase() !== 'torigoyamz_notifymessage' &&
            pluginName?.toLowerCase() !== 'torigoyamz_notifymessagez'
        ) {
            return null;
        }

        if (commandName && commandName !== 'notify') {
            return null;
        }

        if (!message?.trim()) {
            return null;
        }

        return {
            text: message,
            commandName: commandName || 'notify',
        };
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text?.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_torigoya_notify_message_${byCacheKey.size}`,
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
