import { TAG_BRACKET, TAG_STYLE, TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import {
    collectEventCommandEntries,
    extractMessageEntryAt,
    extractScrollTextEntryAt,
} from '../../../js/EventCommandTraversal.js';

/**
 * YEP_MessageCore translator.
 *
 * Supported versions:
 * - MV v1.19 (Yanfly Message Core)
 *
 * Notes:
 * - Mass-translation scanning builds cumulative keys from contiguous message text
 *   command runs (Show Text + Scroll Text payload lines), so runtime-combined
 *   pages from line/window modifiers can match without per-plugin hardcoding.
 * - Runtime translation hooks Window_Message.convertMessageCharacters so final
 *   assembled YEP text can resolve against plugin cache entries.
 */

const YEP_MESSAGE_CORE_PLUGIN_TAGS = [
    {
        description: 'Resets text color to default.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'C',
        requiredConsistency: false,
    },
    {
        description: 'Waits x frames (60 frames = 1 second).',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'W',
        requiredConsistency: false,
    },
    {
        description: 'Creates a name box with x string. Left side.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'N',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: false,
    },
    {
        description: 'Creates a name box with x string. Centered.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'NC',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: false,
    },
    {
        description: 'Creates a name box with x string. Right side.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'NR',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: false,
    },
    {
        description:
            'If using word wrap mode, this will cause a line break (<line break> alias supported by plugin).',
        style: TAG_STYLE.XML,
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'br',
        requiredConsistency: false,
    },
    {
        description: 'Sets x position of text to x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PX',
        requiredConsistency: false,
    },
    {
        description: 'Sets y position of text to y.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PY',
        requiredConsistency: false,
    },
    {
        description: 'Sets outline colour to x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'OC',
        requiredConsistency: false,
    },
    {
        description: 'Sets outline width to x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'OW',
        requiredConsistency: false,
    },
    {
        description: 'Resets all font changes.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'FR',
        requiredConsistency: false,
        addSpace: true,
    },
    {
        description: 'Changes font size to x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'FS',
        requiredConsistency: false,
    },
    {
        description: 'Changes font name to x.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'FN',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: false,
    },
    {
        description: 'Toggles font boldness.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'FB',
        requiredConsistency: false,
        addSpace: true,
    },
    {
        description: 'Toggles font italic.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'FI',
        requiredConsistency: false,
        addSpace: true,
    },
    {
        description: 'Shows face of actor x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'AF',
        requiredConsistency: false,
    },
    {
        description: "Writes out actor's class name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'AC',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out actor's nickname.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'AN',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out actor's class name (no parameter form).",
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'AC',
        reservedWidth: 6,
        requiredConsistency: false,
        addSpace: true,
    },
    {
        description: 'Shows face of party member x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PF',
        requiredConsistency: false,
    },
    {
        description: "Writes out party member x's class name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PC',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out party member x's nickname.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PN',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out class x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NC',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out item x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NI',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out weapon x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NW',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out armour x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NA',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out skill x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NS',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out state x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NT',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out enemy x's name (supported by plugin implementation).",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NE',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out item x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'II',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out weapon x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'IW',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out armour x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'IA',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out skill x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'IS',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out state x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'IT',
        reservedWidth: 6,
        requiredConsistency: false,
    },
];

export class YepMessageCoreTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'YEP_MessageCore';
    }

    getPluginLabel() {
        return 'YEP Message Core';
    }

    getCacheType() {
        return 'plugin_yep_message_core';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(YEP_MESSAGE_CORE_PLUGIN_TAGS);
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
                console.warn('[YepMessageCoreTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this.collectFromCommonEvents(entries);
        await this.collectFromMaps(entries);
        return entries;
    }

    containsLsonTag(text) {
        return String(text || '')
            .toLowerCase()
            .includes(String.raw`\lson`);
    }

    containsLsoffTag(text) {
        return String(text || '')
            .toLowerCase()
            .includes(String.raw`\lsoff`);
    }

    readTextEntryAt(list, startIndex) {
        const messageEntry = extractMessageEntryAt(list, startIndex);
        if (messageEntry) {
            return {
                type: messageEntry.hasPortrait ? 'message_portrait' : 'message',
                value: String(messageEntry.text || ''),
                nextIndex: messageEntry.nextIndex,
                command: messageEntry.command,
            };
        }

        const scrollEntry = extractScrollTextEntryAt(list, startIndex);
        if (scrollEntry) {
            return {
                type: 'message',
                value: String(scrollEntry.text || ''),
                nextIndex: scrollEntry.nextIndex,
                command: scrollEntry.command,
            };
        }

        return null;
    }

    hasAnotherTextCommandAhead(list, fromIndex) {
        if (!Array.isArray(list)) {
            return false;
        }

        for (let i = Math.max(0, Number(fromIndex) || 0); i < list.length; i++) {
            const code = Number(list[i]?.code);
            if (code === 101 || code === 105) {
                return true;
            }

            if (code === 0) {
                return false;
            }
        }

        return false;
    }

    emitTextEntry({ pushEntry, type, value, cmdIndex, nextIndex, mergedSegments, command }) {
        if (!this.isUsableText(value)) {
            return;
        }

        pushEntry({
            type,
            value,
            cmdIndex,
            nextIndex,
            mergedSegments,
            command,
        });
    }

    resetLsonState(state) {
        state.active = false;
        state.type = 'message';
        state.value = '';
        state.startIndex = -1;
        state.startCommand = null;
        state.mergedSegments = 0;
    }

    appendToLsonState(state, entry, startIndex) {
        if (!state.active) {
            state.active = true;
            state.type = entry.type;
            state.value = entry.value;
            state.startIndex = startIndex;
            state.startCommand = entry.command;
            state.mergedSegments = 1;
            return;
        }

        state.value = state.value ? `${state.value}\n${entry.value}` : entry.value;
        state.mergedSegments += 1;
    }

    collectMessageCoreTextEntry(list, startIndex, state, pushEntry, command) {
        const entry = this.readTextEntryAt(list, startIndex);
        if (!entry) {
            return null;
        }

        const startsLson = this.containsLsonTag(entry.value);
        const endsLson = this.containsLsoffTag(entry.value);

        if (state.active) {
            this.appendToLsonState(state, entry, startIndex);

            const shouldClose =
                endsLson || !this.hasAnotherTextCommandAhead(list, Number(entry.nextIndex) || 0);
            if (shouldClose) {
                this.emitTextEntry({
                    pushEntry,
                    type: state.type,
                    value: state.value,
                    cmdIndex: state.startIndex,
                    nextIndex: entry.nextIndex,
                    mergedSegments: state.mergedSegments,
                    command: state.startCommand || command,
                });
                this.resetLsonState(state);
            }

            return {
                handled: true,
                nextIndex: Math.max(startIndex + 1, Number(entry.nextIndex) || startIndex + 1),
            };
        }

        if (startsLson && !endsLson) {
            this.appendToLsonState(state, entry, startIndex);
            return {
                handled: true,
                nextIndex: Math.max(startIndex + 1, Number(entry.nextIndex) || startIndex + 1),
            };
        }

        this.emitTextEntry({
            pushEntry,
            type: entry.type,
            value: entry.value,
            cmdIndex: startIndex,
            nextIndex: entry.nextIndex,
            mergedSegments: 1,
            command,
        });

        return {
            handled: true,
            nextIndex: Math.max(startIndex + 1, Number(entry.nextIndex) || startIndex + 1),
        };
    }

    getEventCommandTraversalExtension() {
        return {
            createState: () => ({
                active: false,
                type: 'message',
                value: '',
                startIndex: -1,
                startCommand: null,
                mergedSegments: 0,
            }),
            collectEntriesAt: ({ list, index, state, pushEntry, command }) =>
                this.collectMessageCoreTextEntry(list, index, state, pushEntry, command),
        };
    }

    getScanTraversalOptions() {
        return {
            traversalExtensions: [this.getEventCommandTraversalExtension()],
        };
    }

    collectFromList(list, baseSource, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        const entries = collectEventCommandEntries(list, this.getScanTraversalOptions());
        for (const entry of entries) {
            if (entry.type !== 'message' && entry.type !== 'message_portrait') {
                continue;
            }

            const text = String(entry.value || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            output.push({
                text,
                cacheType: entry.type,
                source: {
                    ...baseSource,
                    cmdIndex: entry.cmdIndex,
                    mergedSegments: Number(entry.mergedSegments) || 1,
                },
            });
        }
    }

    collectFromMapEvents(events, mapId, output) {
        for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
            const event = events[eventIndex];
            if (!event || !Array.isArray(event.pages)) {
                continue;
            }

            for (let pageIndex = 0; pageIndex < event.pages.length; pageIndex++) {
                const page = event.pages[pageIndex];
                if (!page || !Array.isArray(page.list)) {
                    continue;
                }

                this.collectFromList(
                    page.list,
                    {
                        scope: 'mapEvent',
                        mapId,
                        eventId: Number(event?.id) || eventIndex,
                        pageIndex,
                    },
                    output
                );
            }
        }
    }

    collectFromCommonEvents(output) {
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

            this.collectFromList(commonEvent.list, { scope: 'commonEvent', commonEventId }, output);
        }
    }

    async collectFromMaps(output) {
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

                this.collectFromMapEvents(mapData.events, mapId, output);
            } catch (error) {
                console.warn(
                    `[YepMessageCoreTranslator] Failed to scan map ${mapId} for message entries`,
                    error
                );
            }
        }
    }

    buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();
        for (const entry of this._scanEntries) {
            const text = String(entry?.text || '');
            if (!this.isUsableText(text)) {
                continue;
            }

            const cacheType =
                entry?.cacheType === 'message_portrait' ? 'message_portrait' : 'message';
            const cacheKey = runtime.getCacheKey(text, cacheType);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: cacheType,
                    id: `plugin_yep_message_core_${byCacheKey.size}`,
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
