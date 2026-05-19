import { TAG_BRACKET, TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

/**
 * LunatlazurActorNameWindowTranslator — runtime translation for Lunatlazur_ActorNameWindow.
 *
 * Plugin: Lunatlazur_ActorNameWindow
 * Version: 1.0.0 (2018-04-01)
 * Engine: MV
 *
 * Supported in this translator:
 * - v1.0.0: name box text from \N<name> escape tags in message text.
 *
 * Notes:
 * - Uses actor_name cache (no plugin-specific name cache) for both runtime and mass translation.
 * - Scans map/common-event message lines (event command code 401) for \N<...> tags.
 */

const ACTOR_NAME_CACHE_TYPE = 'actor_name';
const NAME_TAG_REGEX = /\\N<([^>]+)>/gi;

const LUNATLAZUR_ACTOR_NAME_WINDOW_PLUGIN_TAGS = [
    {
        description: 'Creates an actor name window with x string.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'N',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: true,
        alwaysTranslate: true,
        alwaysAddToKnowledgeBase: false,
    },
];

export class LunatlazurActorNameWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'Lunatlazur_ActorNameWindow';
    }

    getPluginLabel() {
        return 'Lunatlazur ActorNameWindow';
    }

    getCacheType() {
        return ACTOR_NAME_CACHE_TYPE;
    }

    enablePluginTranslation() {
        if (
            !window.Window_Message ||
            !Window_Message.prototype ||
            typeof Window_Message.prototype.createSubWindows !== 'function'
        ) {
            return false;
        }

        const patchNameWindowSetText = this.patchNameWindowSetText.bind(this);
        const originalCreateSubWindows = Window_Message.prototype.createSubWindows;

        Window_Message.prototype.createSubWindows = function () {
            const result = originalCreateSubWindows.apply(this, arguments);
            try {
                patchNameWindowSetText(this._nameWindow);
            } catch (error) {
                console.warn(
                    '[LunatlazurActorNameWindowTranslator] Failed to patch actor name window',
                    error
                );
            }
            return result;
        };

        const currentMessageWindow = window.SceneManager?._scene?._messageWindow;
        if (currentMessageWindow?._nameWindow) {
            this.patchNameWindowSetText(currentMessageWindow._nameWindow);
        }

        this.registerPluginCustomTags(LUNATLAZUR_ACTOR_NAME_WINDOW_PLUGIN_TAGS);
        return true;
    }

    patchNameWindowSetText(nameWindow) {
        if (!nameWindow || typeof nameWindow.setText !== 'function') {
            return;
        }

        if (nameWindow._cheatLunatlazurActorNameHooked) {
            return;
        }

        const originalSetText = nameWindow.setText;
        const getRuntime = this.getRuntime.bind(this);
        const isUsableText = this.isUsableText.bind(this);
        const isRuntimeTranslationActive = this.isRuntimeTranslationActive.bind(this);
        const resolveRuntimeTranslation = this.resolveRuntimeTranslation.bind(this);

        // Hook the plugin's own name-box text setter so only the visible name payload is replaced.
        nameWindow.setText = function (text) {
            let nextText = text;

            try {
                const runtime = getRuntime();
                if (runtime && isUsableText(text) && isRuntimeTranslationActive(runtime)) {
                    nextText = resolveRuntimeTranslation(text, runtime, ACTOR_NAME_CACHE_TYPE, {
                        missValue: text,
                    });
                }
            } catch (error) {
                console.warn(
                    '[LunatlazurActorNameWindowTranslator] Failed to resolve actor name translation',
                    error
                );
            }

            return originalSetText.call(this, nextText);
        };

        nameWindow._cheatLunatlazurActorNameHooked = true;
    }

    async buildScanEntries() {
        const entries = [];
        this.collectCommonEventEntries(entries);
        await this.collectMapEntries(entries);
        return entries;
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
                console.warn('[LunatlazurActorNameWindowTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    collectCommonEventEntries(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
            const commonEvent = $dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectNamesFromCommandList(
                commonEvent.list,
                { scope: 'commonEvent', commonEventId },
                output
            );
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
                if (!mapData || !Array.isArray(mapData.events)) {
                    continue;
                }

                this.collectMapEventEntries(mapData.events, mapId, output);
            } catch (error) {
                console.warn(
                    `[LunatlazurActorNameWindowTranslator] Failed to scan map ${mapId}`,
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

                this.collectNamesFromCommandList(
                    page.list,
                    { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                    output
                );
            }
        }
    }

    collectNamesFromCommandList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 401) {
                continue;
            }

            const text = String(cmd.parameters?.[0] || '');
            if (!text) {
                continue;
            }

            let match;
            while ((match = NAME_TAG_REGEX.exec(text)) !== null) {
                const name = String(match[1] || '').trim();
                if (!name) {
                    continue;
                }

                output.push({
                    text: name,
                    source: { ...baseMeta, cmdIdx },
                });
            }

            NAME_TAG_REGEX.lastIndex = 0;
        }
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, ACTOR_NAME_CACHE_TYPE);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: ACTOR_NAME_CACHE_TYPE,
                    id: `plugin_lunatlazur_actor_name_${byCacheKey.size}`,
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
