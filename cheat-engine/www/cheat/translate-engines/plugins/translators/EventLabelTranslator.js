import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../panels/translate-on-the-fly/ObjectTranslationModalMethods.js';

const CACHE_TYPE = 'plugin_event_label';
const SHOW_LABEL_COMMAND = 'SHOW_LABEL';

const LB_EXPLICIT_REGEX = /<LB\s*:\s*([^>]+)>/i;
const LB_PLAIN_REGEX = /<LB>/i;
const LB_NO_REGEX = /<LB_No>/i;

function isUsableText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function toBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') {
            return true;
        }
        if (normalized === 'false') {
            return false;
        }
    }

    if (typeof value === 'number') {
        return value !== 0;
    }

    return fallback;
}

export class EventLabelTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
        this._pluginParameters = null;
        this._pluginParametersResolved = false;
    }

    getPluginName() {
        return 'EventLabel';
    }

    getPluginLabel() {
        return 'EventLabel';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    findPluginEntry() {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const pluginName = String(this.getPluginName() || '').trim().toLowerCase();
        if (!pluginName) {
            return null;
        }

        return (
            window.$plugins.find((plugin) => {
                if (!plugin || typeof plugin.name !== 'string') {
                    return false;
                }

                return plugin.name.trim().toLowerCase() === pluginName;
            }) || null
        );
    }

    getPluginParameters() {
        if (this._pluginParametersResolved) {
            return this._pluginParameters;
        }

        this._pluginParametersResolved = true;
        const pluginEntry = this.findPluginEntry();

        if (
            pluginEntry &&
            pluginEntry.parameters &&
            typeof pluginEntry.parameters === 'object' &&
            !Array.isArray(pluginEntry.parameters)
        ) {
            this._pluginParameters = pluginEntry.parameters;
        } else {
            this._pluginParameters = null;
        }

        return this._pluginParameters;
    }

    shouldUseDefaultDisplay() {
        const parameters = this.getPluginParameters();
        return toBoolean(parameters?.showDefault, false);
    }

    shouldHideNameEv() {
        const parameters = this.getPluginParameters();
        return toBoolean(parameters?.hideNameEv, true);
    }

    isNameHiddenByEvPrefix(name) {
        if (!this.shouldHideNameEv()) {
            return false;
        }

        return /^EV/g.test(String(name || ''));
    }

    extractExplicitLabelFromNote(note) {
        const text = String(note || '');
        const match = LB_EXPLICIT_REGEX.exec(text);
        if (!match || !isUsableText(match[1])) {
            return null;
        }

        return String(match[1]);
    }

    hasPlainLbTag(note) {
        const text = String(note || '');
        return LB_PLAIN_REGEX.test(text);
    }

    hasLbNoTag(note) {
        const text = String(note || '');
        return LB_NO_REGEX.test(text);
    }

    shouldCollectEventNameFromNote(note) {
        if (this.hasLbNoTag(note)) {
            return false;
        }

        if (this.hasPlainLbTag(note)) {
            return true;
        }

        return this.shouldUseDefaultDisplay();
    }

    collectEventNoteEntries(event, mapId, eventIdx, output) {
        if (!event || !Array.isArray(output)) {
            return;
        }

        const note = typeof event.note === 'string' ? event.note : '';
        const explicitLabel = this.extractExplicitLabelFromNote(note);
        if (isUsableText(explicitLabel)) {
            output.push({
                text: explicitLabel,
                source: {
                    scope: 'eventNote',
                    mapId,
                    eventIdx,
                    kind: 'lbExplicit',
                },
            });
            return;
        }

        if (!this.shouldCollectEventNameFromNote(note)) {
            return;
        }

        const eventName = typeof event.name === 'string' ? event.name : '';
        if (!isUsableText(eventName) || this.isNameHiddenByEvPrefix(eventName)) {
            return;
        }

        output.push({
            text: eventName,
            source: {
                scope: 'eventName',
                mapId,
                eventIdx,
            },
        });
    }

    extractShowLabelCommandEntry(cmd) {
        if (!cmd || Number(cmd.code) !== 357) {
            return null;
        }

        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        const pluginName = String(parameters[0] || '').trim();
        const commandName = String(parameters[1] || '').trim();

        if (!pluginName || pluginName.toLowerCase() !== this.getPluginName().toLowerCase()) {
            return null;
        }

        if (commandName !== SHOW_LABEL_COMMAND) {
            return null;
        }

        const args = parameters[3] && typeof parameters[3] === 'object' ? parameters[3] : null;
        const text = args && typeof args.text === 'string' ? args.text : '';
        if (!isUsableText(text)) {
            return null;
        }

        return {
            text,
            commandName,
        };
    }

    collectShowLabelCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            const entry = this.extractShowLabelCommandEntry(cmd);
            if (!entry) {
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
                console.warn('[EventLabelTranslator] Scan failed', error);
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

                this.collectShowLabelCommandsFromList(
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

                    this.collectShowLabelCommandsFromList(
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
                    if (!event) {
                        continue;
                    }

                    this.collectEventNoteEntries(event, mapId, eventIdx, entries);

                    if (!Array.isArray(event.pages)) {
                        continue;
                    }

                    for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
                        const page = event.pages[pageIdx];
                        if (!page || !Array.isArray(page.list)) {
                            continue;
                        }

                        this.collectShowLabelCommandsFromList(
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
                console.warn(`[EventLabelTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    enablePluginTranslation() {
        if (window.__CHEAT_EVENT_LABEL_TRANSLATOR_HOOKED__) {
            return;
        }

        if (!window.Game_Event || !Game_Event.prototype) {
            return;
        }

        if (typeof Game_Event.prototype.getEventLabel !== 'function') {
            return;
        }

        const originalGetEventLabel = Game_Event.prototype.getEventLabel;
        const translator = this;

        Game_Event.prototype.getEventLabel = function () {
            const label = originalGetEventLabel.apply(this, arguments);
            if (!label || typeof label !== 'object') {
                return label;
            }

            const originalText = typeof label.text === 'string' ? label.text : '';
            if (!isUsableText(originalText)) {
                return label;
            }

            try {
                const runtime = translator.getRuntime();
                if (!runtime) {
                    return label;
                }

                const cacheKey = runtime.getCacheKey(originalText, translator.getCacheType());

                runtime.markCacheKeySeen?.(cacheKey);

                if (!runtime.hasUsableCacheValue(cacheKey)) {
                    return label;
                }

                const cached = runtime.translationCache.get(cacheKey);
                if (!isUsableText(cached)) {
                    return label;
                }

                return {
                    ...label,
                    text: cached,
                };
            } catch (error) {
                console.warn(
                    '[EventLabelTranslator] Failed to apply cached event label translation',
                    error
                );
                return label;
            }
        };

        window.__CHEAT_EVENT_LABEL_TRANSLATOR_HOOKED__ = true;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!isUsableText(text)) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, this.getCacheType());
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: this.getCacheType(),
                    id: `plugin_event_label_${byCacheKey.size}`,
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