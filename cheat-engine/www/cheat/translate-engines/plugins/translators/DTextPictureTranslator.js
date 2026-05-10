import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

function normalizeCommandName(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

export class DTextPictureTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'DTextPicture';
    }

    getPluginLabel() {
        return 'DTextPicture';
    }

    getCacheType() {
        return 'plugin_dtext';
    }

    enablePluginTranslation() {
        const translator = this;

        if (
            !window.Game_Screen ||
            !window.Game_Screen ||
            !Game_Screen.prototype ||
            typeof Game_Screen.prototype.setDTextPicture !== 'function'
        ) {
            return;
        }

        const original = Game_Screen.prototype.setDTextPicture;
        Game_Screen.prototype.setDTextPicture = function (value, size) {
            try {
                const runtime = translator.getRuntime();

                if (runtime && typeof value === 'string' && value.trim()) {
                    const cacheKey = runtime.getCacheKey(value, 'plugin_dtext');
                    if (runtime.hasUsableCacheValue(cacheKey)) {
                        const cached = runtime.translationCache.get(cacheKey);
                        if (typeof cached === 'string' && cached.trim()) {
                            arguments[0] = cached;
                        }
                    }
                }
            } catch (error) {
                console.warn(
                    '[DTextPictureTranslator] Failed to apply cached dynamic text translation',
                    error
                );
            }

            return original.apply(this, arguments);
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
                console.warn('[DTextPictureTranslator] Scan failed', error);
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

                this.collectDTextCommandsFromList(
                    commonEvent.list,
                    {
                        scope: 'commonEvent',
                        commonEventId,
                    },
                    entries
                );
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

                        this.collectDTextCommandsFromList(
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
                console.warn(
                    `[DTextPictureTranslator] Failed to scan map ${mapId} for DTextPicture commands`,
                    error
                );
            }
        }

        return entries;
    }

    collectDTextCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const entry = this.extractDTextEntry(cmd);
            if (!entry || !entry.text || !entry.text.trim()) {
                continue;
            }

            output.push({
                text: entry.text,
                commandName: entry.commandName,
                engine: entry.engine,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });
        }
    }

    extractDTextEntry(cmd) {
        const commandCode = Number(cmd && cmd.code);
        if (commandCode === 357) {
            return this.extractMZDTextEntry(cmd);
        }

        if (commandCode === 356) {
            return this.extractMVDTextEntry(cmd);
        }

        return null;
    }

    extractMZDTextEntry(cmd) {
        const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
        const pluginName = String(parameters[0] || '').trim();
        const commandName = String(parameters[1] || '').trim();
        const args = parameters[3] && typeof parameters[3] === 'object' ? parameters[3] : null;
        const text = args && typeof args.text === 'string' ? args.text : '';

        if (!pluginName || pluginName.toLowerCase() !== 'dtextpicture') {
            return null;
        }

        if (commandName !== 'dText') {
            return null;
        }

        if (!text || !text.trim()) {
            return null;
        }

        return {
            text,
            commandName,
            engine: 'MZ',
        };
    }

    extractMVDTextEntry(cmd) {
        const commandLine =
            Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === 'string'
                ? cmd.parameters[0]
                : '';

        return this.parseMVDTextCommandLine(commandLine);
    }

    parseMVDTextCommandLine(commandLine) {
        const line = String(commandLine || '');
        if (!line.trim()) {
            return null;
        }

        const parts = line.split(' ');
        const commandName = String(parts.shift() || '').trim();
        if (normalizeCommandName(commandName) !== 'D_TEXT') {
            return null;
        }

        while (parts.length > 0 && !String(parts[parts.length - 1] || '').trim()) {
            parts.pop();
        }

        if (parts.length > 1) {
            const lastArg = String(parts[parts.length - 1] || '').trim();
            if (/^[+-]?\d+$/.test(lastArg)) {
                parts.pop();
            }
        }

        const text = parts.join(' ').trim();
        if (!text) {
            return null;
        }

        return {
            text,
            commandName: 'D_TEXT',
            engine: 'MV',
        };
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
                    id: `plugin_dtext_${byCacheKey.size}`,
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
