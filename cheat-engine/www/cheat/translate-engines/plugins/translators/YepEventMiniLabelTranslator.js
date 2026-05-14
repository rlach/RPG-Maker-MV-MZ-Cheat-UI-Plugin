import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

/**
 * YEP Event Mini Label translator.
 *
 * Supported versions:
 * - v1.07 (MV)
 *
 * Translation notes:
 * - Source text is stored in event-page comment tags: <Mini Label: text>
 * - The plugin renders label text through Window_EventMiniLabel#setText
 */
const CACHE_TYPE = 'plugin_yep_event_mini_label';
const MINI_LABEL_TAG_REGEX = /<(?:MINI WINDOW|MINI LABEL): (.*)>/i;

export class YepEventMiniLabelTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'YEP_EventMiniLabel';
    }

    getPluginLabel() {
        return 'YEP Event Mini Label';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const WindowEventMiniLabel = window.Window_EventMiniLabel;
        if (typeof WindowEventMiniLabel?.prototype?.setText !== 'function') {
            return;
        }

        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const cacheType = this.getCacheType();
        const originalSetText = WindowEventMiniLabel.prototype.setText;

        WindowEventMiniLabel.prototype.setText = function (text) {
            try {
                const runtime = getRuntime();
                if (!isUsableText(text) || !runtime) {
                    return originalSetText.call(this, text);
                }

                if (!isRuntimeTranslationActive(runtime)) {
                    return originalSetText.call(this, text);
                }

                const cacheKey = runtime.getCacheKey(text, cacheType);
                runtime.trackCacheKeyUsage(cacheKey);

                if (!runtime.hasUsableCacheValue(cacheKey)) {
                    return originalSetText.call(this, text);
                }

                const cached = runtime.translationCache.get(cacheKey);
                if (!isUsableText(cached)) {
                    return originalSetText.call(this, text);
                }

                return originalSetText.call(this, cached);
            } catch (error) {
                console.warn(
                    '[YepEventMiniLabelTranslator] Failed to apply runtime mini label translation',
                    error
                );
                return originalSetText.call(this, text);
            }
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
                console.warn('[YepEventMiniLabelTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        await this.collectMapEntries(entries);
        return entries;
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
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                this.collectMapEventEntries(mapData.events, mapId, output);
            } catch (error) {
                console.warn(
                    `[YepEventMiniLabelTranslator] Failed to scan map ${mapId} for mini labels`,
                    error
                );
            }
        }
    }

    collectMapEventEntries(events, mapId, output) {
        for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
            const event = events[eventIdx];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                const page = event.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectMiniLabelEntriesFromList(
                    page.list,
                    { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                    output
                );
            }
        }
    }

    collectMiniLabelEntriesFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const code = Number(cmd.code);
            if (code !== 108 && code !== 408) {
                continue;
            }

            const line =
                Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === 'string'
                    ? cmd.parameters[0]
                    : '';
            const text = this.extractMiniLabelText(line);
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

    extractMiniLabelText(line) {
        const commentLine = String(line || '');
        const match = MINI_LABEL_TAG_REGEX.exec(commentLine);
        if (!match || !this.isUsableText(match[1])) {
            return null;
        }

        return String(match[1]);
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
                    id: `plugin_yep_event_mini_label_${byCacheKey.size}`,
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
