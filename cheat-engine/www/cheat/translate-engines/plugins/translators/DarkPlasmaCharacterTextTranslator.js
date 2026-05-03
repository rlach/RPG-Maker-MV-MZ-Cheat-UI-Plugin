import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../panels/translate-on-the-fly/ObjectTranslationModalMethods.js';

const CHARACTER_TEXT_META_REGEX = /<\s*characterText\s*>/i;

export class DarkPlasmaCharacterTextTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'DarkPlasma_CharacterText';
    }

    getPluginLabel() {
        return 'DarkPlasma CharacterText';
    }

    getCacheType() {
        return 'plugin_dark_plasma_character_text';
    }

    enablePluginTranslation() {
        if (
            !window.Spriteset_Map ||
            !Spriteset_Map.prototype ||
            typeof Spriteset_Map.prototype.setupCharacterText !== 'function'
        ) {
            return;
        }

        const cacheType = this.getCacheType();
        const getRuntime = this.getRuntime.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const original = Spriteset_Map.prototype.setupCharacterText;

        Spriteset_Map.prototype.setupCharacterText = function (request) {
            try {
                const runtime = getRuntime();
                if (!runtime || !isRuntimeTranslationActive(runtime)) {
                    return original.call(this, request);
                }

                const text = typeof request?.text === 'string' ? request.text : '';
                if (!text.trim()) {
                    return original.call(this, request);
                }

                const cacheKey = runtime.getCacheKey(text, cacheType);
                runtime.markCacheKeySeen(cacheKey);

                if (runtime.hasUsableCacheValue(cacheKey)) {
                    const cached = runtime.translationCache.get(cacheKey);
                    if (typeof cached === 'string' && cached.trim()) {
                        const translatedRequest = request
                            ? { ...request, text: cached }
                            : { text: cached };
                        return original.call(this, translatedRequest);
                    }
                }
            } catch (error) {
                console.warn(
                    '[DarkPlasmaCharacterTextTranslator] Failed to apply cached character text translation',
                    error
                );
            }

            return original.call(this, request);
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
                console.warn('[DarkPlasmaCharacterTextTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];

        for (const mapInfo of mapInfos) {
            const mapId = Number(mapInfo?.id);
            if (!mapId) {
                continue;
            }

            try {
                const mapData = await this.loadScannableMapData(mapId);
                if (mapData) {
                    this.collectMapEntries(mapId, mapData, entries);
                }
            } catch (error) {
                console.warn(
                    `[DarkPlasmaCharacterTextTranslator] Failed to scan map ${mapId}`,
                    error
                );
            }
        }

        return entries;
    }

    async loadScannableMapData(mapId) {
        const mapData = await loadMapDataById(mapId);
        if (!mapData || !Array.isArray(mapData.events)) {
            return null;
        }

        return mapData;
    }

    isCharacterTextEvent(event) {
        return !!(event && Array.isArray(event.pages) && CHARACTER_TEXT_META_REGEX.test(event.note || ''));
    }

    collectMapEntries(mapId, mapData, output) {
        for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
            const event = mapData.events[eventIdx];
            if (!this.isCharacterTextEvent(event)) {
                continue;
            }

            this.collectEventPageEntries(mapId, eventIdx, event.pages, output);
        }
    }

    collectEventPageEntries(mapId, eventIdx, pages, output) {
        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            const page = pages[pageIdx];
            if (!page || !Array.isArray(page.list)) {
                continue;
            }

            this.collectRegisterTextsFromList(
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

    collectRegisterTextsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            const text = this.extractRegisterText(cmd);
            if (!text) {
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

    extractRegisterText(cmd) {
        if (!cmd || Number(cmd.code) !== 357) {
            return '';
        }

        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        const pluginName = String(parameters[0] || '').trim().toLowerCase();
        const commandName = String(parameters[1] || '').trim();
        const args = parameters[3] && typeof parameters[3] === 'object' ? parameters[3] : null;
        const text = String(args?.text || '').trim();

        if (pluginName !== 'darkplasma_charactertext' || commandName !== 'register') {
            return '';
        }

        return text;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text?.trim()) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_dark_plasma_character_text_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(panel);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}