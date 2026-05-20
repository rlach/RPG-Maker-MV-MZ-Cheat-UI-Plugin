import { TAG_BRACKET, TAG_STYLE, TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';
import { extractMessageEntryAt } from '../../../js/EventCommandTraversal.js';

/**
 * YEP_MessageCore translator.
 *
 * Supported versions:
 * - MV v1.19 (Yanfly Message Core)
 *
 * Notes:
 * - Mass-translation scanning merges consecutive Show Text blocks (101/401) when
 *   MessageRows is configured above 4, matching YEP's command101 continuation flow.
 * - Runtime translation hooks Window_Message.convertMessageCharacters so final
 *   assembled YEP text can resolve against plugin cache entries.
 */

const SHOW_TEXT_CODE = 101;
const PLUGIN_COMMAND_CODE = 356;
const DEFAULT_MESSAGE_ROWS = 4;
const MESSAGE_ROWS_COMMAND_RE = /^MessageRows\s+(.+)$/i;

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
        this._defaultMessageRows = null;
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

    getDefaultMessageRows() {
        const defaultRows = this._defaultMessageRows;
        if (typeof defaultRows === 'number' && Number.isInteger(defaultRows) && defaultRows > 0) {
            return defaultRows;
        }

        const pluginEntry = this.findPluginEntry(this.getPluginName());
        const configured = String(pluginEntry?.parameters?.['Default Rows'] || '').trim();
        const parsed = Number(configured);
        const fallback = Number.isFinite(parsed) ? Math.floor(parsed) : DEFAULT_MESSAGE_ROWS;

        this._defaultMessageRows = Math.max(1, fallback || DEFAULT_MESSAGE_ROWS);
        return this._defaultMessageRows;
    }

    resolveMessageRowsCommandValue(command) {
        if (!command || Number(command.code) !== PLUGIN_COMMAND_CODE) {
            return null;
        }

        const raw = String(command.parameters?.[0] || '').trim();
        if (!raw) {
            return null;
        }

        const match = MESSAGE_ROWS_COMMAND_RE.exec(raw);
        if (!match) {
            return null;
        }

        const parsed = Number(String(match[1] || '').trim());
        if (!Number.isFinite(parsed)) {
            return null;
        }

        return Math.max(1, Math.floor(parsed));
    }

    buildMergedMessageEntry(list, startIndex, currentRows) {
        const first = extractMessageEntryAt(list, startIndex);
        if (!first) {
            return null;
        }

        let mergedText = String(first.text || '');
        let nextIndex = first.nextIndex;
        let mergedSegments = 1;

        if (currentRows > DEFAULT_MESSAGE_ROWS) {
            while (nextIndex < list.length && list[nextIndex]?.code === SHOW_TEXT_CODE) {
                const nextMessage = extractMessageEntryAt(list, nextIndex);
                if (!nextMessage) {
                    break;
                }

                const nextText = String(nextMessage.text || '');
                mergedText = mergedText ? `${mergedText}\n${nextText}` : nextText;
                nextIndex = nextMessage.nextIndex;
                mergedSegments += 1;
            }
        }

        return {
            text: mergedText,
            hasPortrait: !!first.hasPortrait,
            nextIndex,
            mergedSegments,
        };
    }

    collectFromList(list, baseSource, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        let messageRows = this.getDefaultMessageRows();
        let i = 0;
        while (i < list.length) {
            const command = list[i];
            if (!command) {
                i += 1;
                continue;
            }

            const nextRows = this.resolveMessageRowsCommandValue(command);
            if (nextRows !== null) {
                messageRows = nextRows;
                i += 1;
                continue;
            }

            if (Number(command.code) !== SHOW_TEXT_CODE) {
                i += 1;
                continue;
            }

            const merged = this.buildMergedMessageEntry(list, i, messageRows);
            if (!merged) {
                i += 1;
                continue;
            }

            if (this.isUsableText(merged.text)) {
                output.push({
                    text: merged.text,
                    cacheType: merged.hasPortrait ? 'message_portrait' : 'message',
                    source: {
                        ...baseSource,
                        cmdIndex: i,
                        mergedSegments: merged.mergedSegments,
                        messageRows,
                    },
                });
            }

            i = Math.max(i + 1, merged.nextIndex);
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
