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

    resolveCachedDestinationText(text, runtime) {
        if (!this.isUsableText(text) || !runtime) {
            return null;
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

        return null;
    }

    buildTranslatedMZCommandParams(params, runtime) {
        if (!runtime || !Array.isArray(params)) {
            return null;
        }

        const pluginName = String(params[0] || '').trim();
        const commandName = String(params[1] || '').trim();
        if (
            !this.isDestinationWindowPlugin(pluginName) ||
            !this.isSetDestinationMZCommand(commandName)
        ) {
            return null;
        }

        const args = params[3] && typeof params[3] === 'object' ? params[3] : null;
        const parsed = this.parseMZSetDestinationArgs(args);
        if (!parsed) {
            return null;
        }

        const cached = this.resolveCachedDestinationText(parsed.text, runtime);
        if (!this.isUsableText(cached)) {
            return null;
        }

        const nextParams = params.slice();
        nextParams[3] = {
            ...args,
            destination: cached,
        };
        return nextParams;
    }

    translateRuntimeDestination(text, runtime) {
        if (!this.isUsableText(text)) {
            return text;
        }

        if (!runtime || !this.isRuntimeTranslationActive(runtime)) {
            return text;
        }

        return this.resolveCachedDestinationText(text, runtime) || text;
    }

    translateRuntimeDestinationValue(destinationValue, runtime) {
        if (Array.isArray(destinationValue)) {
            if (!destinationValue.length) {
                return destinationValue;
            }

            const allStringItems = destinationValue.every((item) => typeof item === 'string');

            if (allStringItems) {
                const originalJoined = destinationValue.join('\n');
                const translatedJoined = this.translateRuntimeDestination(originalJoined, runtime);
                if (translatedJoined !== originalJoined) {
                    return translatedJoined.split('\n');
                }
            }

            let changed = false;
            const translatedList = destinationValue.map((item) => {
                if (typeof item !== 'string') {
                    return item;
                }

                const translated = this.translateRuntimeDestination(item, runtime);
                if (translated !== item) {
                    changed = true;
                }
                return translated;
            });

            return changed ? translatedList : destinationValue;
        }

        if (typeof destinationValue === 'string') {
            return this.translateRuntimeDestination(destinationValue, runtime);
        }

        return destinationValue;
    }

    enablePluginTranslation() {
        if (
            !window.Game_System ||
            !Game_System.prototype ||
            typeof Game_System.prototype.getDestination !== 'function'
        ) {
            return false;
        }

        const getRuntime = this.getRuntime.bind(this);
        const translateRuntimeDestinationValue = this.translateRuntimeDestinationValue.bind(this);
        const originalGetDestination = Game_System.prototype.getDestination;

        Game_System.prototype.getDestination = function () {
            const destinationText = originalGetDestination.apply(this, arguments);

            try {
                return translateRuntimeDestinationValue(destinationText, getRuntime());
            } catch (error) {
                console.warn(
                    '[DestinationWindowTranslator] Failed to apply runtime destination translation',
                    error
                );
                return destinationText;
            }
        };

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

            const lines = parsed.text.split('\n');
            if (lines.length > 1) {
                for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                    const lineText = lines[lineIdx];
                    if (!this.isUsableText(lineText)) {
                        continue;
                    }

                    output.push({
                        text: lineText,
                        command: parsed.command,
                        source: {
                            ...baseMeta,
                            cmdIdx,
                            lineIdx,
                        },
                    });
                }
            }
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
