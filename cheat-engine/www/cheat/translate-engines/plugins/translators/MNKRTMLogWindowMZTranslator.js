/**
 * MNKR_TMLogWindowMZ translator
 *
 * Supported plugin:
 * - MNKR_TMLogWindowMZ (MZ, version unknown)
 *
 * Translation notes:
 * - Collects log text from plugin commands in common events, troop events, and map events.
 * - Supports both MV-style command lines (code 356) and MZ plugin commands (code 357).
 * - Mirrored logs reuse whole-message cache entries at presentation, before escape rendering.
 */

import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { isKnownDisplayTranslation } from '../NotificationTranslationContext.js';

const CACHE_TYPE = 'plugin_mnkr_tm_log_window_mz';
const PLUGIN_NAME_ALIASES = ['MNKR_TMLogWindowMZ', 'TMLogWindowMZ'];
const CANDIDATE_COMMAND_NAMES = new Set(['addlog', 'addlogtext', 'add', 'showlog', 'writelog']);
const CANDIDATE_TEXT_ARG_KEYS = ['text', 'message', 'log', 'value', 'line'];

function isSupportedPluginName(value) {
    const pluginName = String(value || '')
        .trim()
        .toLowerCase();

    return PLUGIN_NAME_ALIASES.some((name) => name.toLowerCase() === pluginName);
}

function normalizeCommandToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function extractTextLikeValueFromObject(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    for (const key of CANDIDATE_TEXT_ARG_KEYS) {
        const text = typeof value[key] === 'string' ? value[key] : '';
        if (text.trim()) {
            return text;
        }
    }

    return null;
}

function splitCommandLine(commandLine) {
    const source = String(commandLine || '').trim();
    if (!source) {
        return [];
    }

    return source.split(/\s+/);
}

function extractTextFromMVCommand(commandLine) {
    const parts = splitCommandLine(commandLine);
    if (parts.length < 2) {
        return null;
    }

    const commandName = normalizeCommandToken(parts[0]);
    if (
        commandName !== 'showlogwindow' &&
        commandName !== 'tmlogwindow' &&
        commandName !== 'mnkr_tmlogwindowmz'
    ) {
        return null;
    }

    const subcommand = normalizeCommandToken(parts[1]);
    if (!CANDIDATE_COMMAND_NAMES.has(subcommand)) {
        return null;
    }

    const rest = parts.slice(2).join(' ');
    return rest.trim() ? rest : null;
}

function extractScriptLogTexts(scriptBlock) {
    const source = String(scriptBlock || '');
    if (!source.trim()) {
        return [];
    }

    const results = [];
    const pattern =
        /\$gameSystem\.(?:addLog|addActionLog|addTextLog|pushLog)\s*\(\s*(['"])([\s\S]*?)\1\s*\)/g;

    let match = pattern.exec(source);
    while (match) {
        const text = String(match[2] || '');
        if (text.trim()) {
            results.push(text);
        }
        match = pattern.exec(source);
    }

    return results;
}

export class MNKRTMLogWindowMZTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'MNKR_TMLogWindowMZ';
    }

    getPluginAliases() {
        return PLUGIN_NAME_ALIASES;
    }

    getPluginLabel() {
        return 'MNKR TMLogWindowMZ';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const system = window.Game_System?.prototype;
        const message = window.Game_Message?.prototype;
        const base = window.Window_Base?.prototype;
        if (
            typeof system?.addLog !== 'function' ||
            typeof message?.add !== 'function' ||
            typeof base?.drawTextEx !== 'function'
        )
            return false;
        const translator = this;
        const origins = new Map();
        let mirror = null;
        let group = null;
        const addMessage = message.add;
        message.add = function (text, ...args) {
            const previous = mirror;
            if (!this._texts?.length) group = { lines: [], portrait: !!this.faceName() };
            group ??= { lines: [], portrait: !!this.faceName() };
            const index = group.lines.push(text) - 1;
            mirror = { source: text, group, index, portrait: group.portrait };
            try {
                return addMessage.call(this, text, ...args);
            } finally {
                mirror = previous;
            }
        };
        const addLog = system.addLog;
        system.addLog = function (text, ...args) {
            const result = addLog.call(this, text, ...args);
            const stored = this._actionLog?.[this._actionLog.length - 1];
            if (typeof stored === 'string') {
                origins.set(stored, mirror ? { ...mirror, mirrored: true } : { source: text });
                if (origins.size > 4096) origins.delete(origins.keys().next().value);
            }
            return result;
        };
        const draw = base.drawTextEx;
        base.drawTextEx = function (text, ...args) {
            if (!['Window_MapLog', 'Window_MenuLog'].includes(this.constructor.name))
                return draw.call(this, text, ...args);
            const runtime = translator.getRuntime();
            if (
                !translator.isRuntimeTranslationActive(runtime) ||
                isKnownDisplayTranslation(runtime, text)
            )
                return draw.call(this, text, ...args);
            // eslint-disable-next-line no-control-regex -- Restore RPG Maker ESC controls for cache lookup.
            const origin = origins.get(text) || { source: String(text).replace(/\x1b/g, '\\') };
            const source = origin.group ? origin.group.lines.join('\n') : origin.source;
            const preferred = runtime.getPreferredMessageCacheEntry(source, {
                hasPortrait: origin.portrait,
            });
            let translated = preferred?.value;
            if (translator.isUsableText(translated) && origin.group?.lines.length > 1) {
                const lines = translated.split('\n');
                translated =
                    lines.length === origin.group.lines.length
                        ? lines[origin.index]
                        : origin.index === origin.group.lines.length - 1
                          ? lines.join(' ')
                          : '';
                return draw.call(this, translated, ...args);
            }
            if (!translator.isUsableText(translated)) {
                // A mirrored cache miss belongs to the regular message pipeline.
                translated = origin.mirrored
                    ? text
                    : translator.resolveRuntimeTranslation(origin.source, runtime);
            }
            return draw.call(this, translated, ...args);
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
                console.warn('[MNKRTMLogWindowMZTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    extractEntryFromCommand(command) {
        if (!command || !Array.isArray(command.parameters)) {
            return null;
        }

        if (Number(command.code) === 357) {
            const pluginName = String(command.parameters[0] || '');
            const commandName = normalizeCommandToken(command.parameters[1]);
            if (!isSupportedPluginName(pluginName) || !CANDIDATE_COMMAND_NAMES.has(commandName)) {
                return null;
            }

            const parsedArgs = parseJsonSafely(command.parameters[3], command.parameters[3]);
            return extractTextLikeValueFromObject(parsedArgs);
        }

        if (Number(command.code) === 356) {
            return extractTextFromMVCommand(command.parameters[0]);
        }

        return null;
    }

    collectEntriesFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        let scriptBuffer = '';
        let scriptStartIdx = -1;

        const flushScriptBuffer = () => {
            if (!scriptBuffer.trim()) {
                scriptBuffer = '';
                scriptStartIdx = -1;
                return;
            }

            const texts = extractScriptLogTexts(scriptBuffer);
            for (let i = 0; i < texts.length; i++) {
                output.push({
                    text: texts[i],
                    source: {
                        ...baseMeta,
                        cmdIdx: scriptStartIdx,
                        scriptTextIndex: i,
                    },
                });
            }

            scriptBuffer = '';
            scriptStartIdx = -1;
        };

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const command = list[cmdIdx];
            const code = Number(command?.code);

            if (code === 355 || code === 655) {
                if (scriptStartIdx < 0) {
                    scriptStartIdx = cmdIdx;
                }

                scriptBuffer += `${String(command.parameters?.[0] || '')}\n`;
                continue;
            }

            flushScriptBuffer();

            const text = this.extractEntryFromCommand(command);
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

        flushScriptBuffer();
    }

    collectCommonEventEntries(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (
            let commonEventId = 0;
            commonEventId < window.$dataCommonEvents.length;
            commonEventId++
        ) {
            const commonEvent = window.$dataCommonEvents[commonEventId];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this.collectEntriesFromList(
                commonEvent.list,
                {
                    scope: 'commonEvent',
                    commonEventId,
                },
                output
            );
        }
    }

    collectTroopEntries(output) {
        if (!Array.isArray(window.$dataTroops)) {
            return;
        }

        for (let troopId = 0; troopId < window.$dataTroops.length; troopId++) {
            const troop = window.$dataTroops[troopId];
            if (!troop || !Array.isArray(troop.pages)) {
                continue;
            }

            for (let pageIdx = 0; pageIdx < troop.pages.length; pageIdx++) {
                const page = troop.pages[pageIdx];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectEntriesFromList(
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

                this.collectEntriesFromList(
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
                console.warn(`[MNKRTMLogWindowMZTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    async buildScanEntries() {
        const entries = [];
        this.collectCommonEventEntries(entries);
        this.collectTroopEntries(entries);
        await this.collectMapEntries(entries);
        return entries;
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
                    id: `plugin_mnkr_tm_log_window_mz_${byCacheKey.size}`,
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
