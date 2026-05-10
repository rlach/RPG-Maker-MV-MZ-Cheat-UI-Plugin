import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

export class TextPictureTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'TextPicture';
    }

    getPluginLabel() {
        return 'TextPicture';
    }

    getCacheType() {
        return 'plugin_text_picture';
    }

    enablePluginTranslation() {
        if (
            !window.Game_Picture ||
            !Game_Picture.prototype ||
            typeof Game_Picture.prototype.show !== 'function'
        ) {
            return;
        }

        const original = Game_Picture.prototype.show;
        const translator = this;

        Game_Picture.prototype.show = function () {
            const result = original.apply(this, arguments);

            try {
                const runtime =
                    window.__ensureTranslationRuntime?.() || window.__TranslationRuntime || null;

                if (
                    !runtime
                ) {
                    return result;
                }

                const text = typeof this.mzkp_text === 'string' ? this.mzkp_text : '';
                if (!text || !text.trim()) {
                    return result;
                }

                const cacheKey = runtime.getCacheKey(text, translator.getCacheType());

                runtime.trackCacheKeyUsage(cacheKey);

                if (!runtime.hasUsableCacheValue(cacheKey)) {
                    return result;
                }

                const cached = runtime.translationCache.get(cacheKey);
                if (typeof cached !== 'string' || !cached.trim()) {
                    return result;
                }

                this.mzkp_text = cached;
                this.mzkp_textChanged = true;
            } catch (error) {
                console.warn(
                    '[TextPictureTranslator] Failed to apply cached TextPicture translation',
                    error
                );
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
                console.warn('[TextPictureTranslator] Scan failed', error);
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

                this.collectTextPictureCommandsFromList(
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

                    this.collectTextPictureCommandsFromList(
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

                        this.collectTextPictureCommandsFromList(
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
                console.warn(`[TextPictureTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectTextPictureCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 357) {
                continue;
            }

            const entry = this.extractMZTextPictureEntry(cmd);
            if (!entry || !entry.text || !entry.text.trim()) {
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

    extractMZTextPictureEntry(cmd) {
        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        const pluginName = String(parameters[0] || '').trim();
        const commandName = String(parameters[1] || '').trim();
        const args = this.normalizeArgsObject(parameters[3]);
        const text = args && typeof args.text === 'string' ? args.text : '';

        if (!pluginName || pluginName.toLowerCase() !== 'textpicture') {
            return null;
        }

        if (commandName && commandName !== 'set') {
            return null;
        }

        if (!text || !text.trim()) {
            return null;
        }

        return {
            text,
            commandName,
        };
    }

    normalizeArgsObject(rawArgs) {
        if (rawArgs && typeof rawArgs === 'object') {
            return rawArgs;
        }

        if (typeof rawArgs !== 'string') {
            return null;
        }

        const source = rawArgs.trim();
        if (!source) {
            return null;
        }

        try {
            const parsed = JSON.parse(source);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (_error) {
            return null;
        }

        return null;
    }

    isDatabaseLikelyLoaded() {
        if (
            window.DataManager &&
            typeof DataManager.isDatabaseLoaded === 'function' &&
            DataManager.isDatabaseLoaded()
        ) {
            return true;
        }

        if (Array.isArray(window.$dataMapInfos) || Array.isArray(window.$dataCommonEvents)) {
            return true;
        }

        return false;
    }

    scheduleScanRefreshIfNeeded() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPromise) {
            return;
        }

        if (!this._scanPrepared) {
            this.prepareTranslator();
            return;
        }

        if (this._scanEntries.length > 0) {
            return;
        }

        if (!this.isDatabaseLikelyLoaded()) {
            return;
        }

        this._scanPrepared = false;
        this.prepareTranslator();
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text || !text.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_text_picture_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ runtime }) {
        this.scheduleScanRefreshIfNeeded();

        if (!runtime) {
            return [];
        }

        const items = this.buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ runtime }) {
        this.scheduleScanRefreshIfNeeded();

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
