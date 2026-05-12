import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

const DESTINATION_SET_COMMANDS = new Set(['DW_目標設定', 'DW_SET_DESTINATION']);

const DESTINATION_SET_WITH_ICON_COMMANDS = new Set([
    'DW_アイコン付き目標設定',
    'DW_SET_DESTINATION_WITH_ICON',
]);

const DESTINATION_WINDOW_PLUGIN_NAME = 'destinationwindow';
const MZ_DESTINATION_SET_COMMAND = 'SET_DESTINATION';

function toUpperSafe(value) {
    return String(value || '')
        .trim()
        .toUpperCase();
}

function toLowerSafe(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function normalizePluginCommandText(args) {
    if (!Array.isArray(args)) {
        return '';
    }

    return args.reduce((previous, arg) => previous + ' ' + String(arg || ''), '').replace(/^ /, '');
}

export class DestinationWindowTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'DestinationWindow';
    }

    getPluginLabel() {
        return 'DestinationWindow';
    }

    getCacheType() {
        return 'plugin_destination_window';
    }

    isSetDestinationCommand(command) {
        const safeCommand = String(command || '').trim();
        const upper = toUpperSafe(safeCommand);
        return DESTINATION_SET_COMMANDS.has(safeCommand) || upper === 'DW_SET_DESTINATION';
    }

    isSetDestinationWithIconCommand(command) {
        const safeCommand = String(command || '').trim();
        const upper = toUpperSafe(safeCommand);
        return (
            DESTINATION_SET_WITH_ICON_COMMANDS.has(safeCommand) ||
            upper === 'DW_SET_DESTINATION_WITH_ICON'
        );
    }

    parseCommandLine(commandLine) {
        const line = String(commandLine || '');
        if (!line.trim()) {
            return null;
        }

        const parts = line.split(' ');
        const command = String(parts.shift() || '').trim();
        if (!command) {
            return null;
        }

        if (this.isSetDestinationCommand(command)) {
            const text = normalizePluginCommandText(parts);
            if (!text?.trim()) {
                return null;
            }

            return {
                command,
                text,
            };
        }

        if (this.isSetDestinationWithIconCommand(command)) {
            const icon = String(parts.shift() || '').trim();
            const text = normalizePluginCommandText(parts);
            if (!text?.trim()) {
                return null;
            }

            return {
                command,
                icon,
                text,
            };
        }

        return null;
    }

    isDestinationWindowPlugin(pluginName) {
        return toLowerSafe(pluginName) === DESTINATION_WINDOW_PLUGIN_NAME;
    }

    isSetDestinationMZCommand(commandName) {
        return toUpperSafe(commandName) === MZ_DESTINATION_SET_COMMAND;
    }

    parseMZSetDestinationArgs(args) {
        if (!args || typeof args !== 'object') {
            return null;
        }

        const text = typeof args.destination === 'string' ? args.destination : '';
        if (!this.isUsableText(text)) {
            return null;
        }

        const icon = args.icon == null ? '' : String(args.icon).trim();
        return {
            command: MZ_DESTINATION_SET_COMMAND,
            icon,
            text,
        };
    }

    translateRuntimeDestination(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        if (!runtime || !this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        const sourceCandidates = [text];
        if (text.startsWith(' ')) {
            sourceCandidates.push(text.slice(1));
        }

        for (const sourceText of sourceCandidates) {
            const cacheKey = runtime.getCacheKey(sourceText, this.getCacheType());
            runtime.trackCacheKeyUsage(cacheKey);

            if (!runtime.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            const cached = runtime.translationCache.get(cacheKey);
            if (this.isUsableText(cached)) {
                return cached;
            }
        }

        return text;
    }

    enablePluginTranslation() {
        if (!window.Game_System || !Game_System.prototype) {
            return;
        }

        const getRuntime = this.getRuntime.bind(this);
        const translateRuntimeDestination = this.translateRuntimeDestination.bind(this);
        const originalGetDestination = Game_System.prototype.getDestination;

        if (typeof originalGetDestination === 'function') {
            Game_System.prototype.getDestination = function () {
                const destinationText = originalGetDestination.apply(this, arguments);

                try {
                    return translateRuntimeDestination(destinationText, getRuntime());
                } catch (error) {
                    console.warn(
                        '[DestinationWindowTranslator] Failed to apply runtime destination translation',
                        error
                    );
                    return destinationText;
                }
            };
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
                console.warn('[DestinationWindowTranslator] Scan failed', error);
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

                this.collectDestinationCommandsFromList(
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
            const mapId = Number(mapInfo?.id);
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

                        this.collectDestinationCommandsFromList(
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
                console.warn(`[DestinationWindowTranslator] Failed to scan map ${mapId}`, error);
            }
        }

        return entries;
    }

    collectDestinationCommandsFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            const parsed = this.extractDestinationEntry(cmd);
            if (!parsed || !this.isUsableText(parsed.text)) {
                continue;
            }

            output.push({
                text: parsed.text,
                command: parsed.command,
                source: {
                    ...baseMeta,
                    cmdIdx,
                },
            });
        }
    }

    extractDestinationEntry(cmd) {
        if (!cmd) {
            return null;
        }

        const commandCode = Number(cmd.code);
        if (commandCode === 356) {
            const commandLine =
                Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === 'string'
                    ? cmd.parameters[0]
                    : '';
            return this.parseCommandLine(commandLine);
        }

        if (commandCode === 357) {
            const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
            const pluginName = String(parameters[0] || '').trim();
            const commandName = String(parameters[1] || '').trim();
            if (
                !this.isDestinationWindowPlugin(pluginName) ||
                !this.isSetDestinationMZCommand(commandName)
            ) {
                return null;
            }

            const args = parameters[3] && typeof parameters[3] === 'object' ? parameters[3] : null;
            return this.parseMZSetDestinationArgs(args);
        }

        return null;
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
                    id: `plugin_destination_window_${byCacheKey.size}`,
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
