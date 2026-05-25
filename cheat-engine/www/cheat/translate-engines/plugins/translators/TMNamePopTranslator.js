import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

const NAME_POP_COMMAND = 'namepop';
const TM_NAME_POP_COMMAND = 'tmnamepop';
const TM_NAME_POP_SET_SUBCOMMAND = 'set';
const NAME_POP_TAG_REGEX = /<namePop:([^>]+)>/i;
const CACHE_TYPE = 'plugin_tm_name_pop';
const PLUGIN_NAME_ALIASES = ['TMNamePop', 'ネームポップ'];

// Tag value format: "nameText [shiftY] [outlineColor]"
// The name is the first space-separated token (mirroring arr[0] in the plugin source).
function extractNameFromTagValue(tagValue) {
    const firstToken = String(tagValue || '')
        .trim()
        .split(' ')[0];
    return firstToken || null;
}

function applyNamePopTranslation(namePop, runtime) {
    if (typeof namePop !== 'string' || !namePop.trim()) {
        return namePop;
    }

    if (!runtime) {
        return namePop;
    }

    const cacheKey = runtime.getCacheKey(namePop, CACHE_TYPE);

    runtime.trackCacheKeyUsage(cacheKey);

    if (!runtime.hasUsableCacheValue(cacheKey)) {
        return namePop;
    }

    const cached = runtime.translationCache.get(cacheKey);
    return typeof cached === 'string' && cached.trim() ? cached : namePop;
}

export class TMNamePopTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'TMNamePop';
    }

    getPluginLabel() {
        return 'TMNamePop';
    }

    getPluginAliases() {
        return PLUGIN_NAME_ALIASES;
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    applyNamePopTranslation(namePop) {
        return applyNamePopTranslation(namePop, this.getRuntime());
    }

    tryHookSetNamePop() {
        if (
            !window.Game_CharacterBase ||
            !Game_CharacterBase.prototype ||
            typeof Game_CharacterBase.prototype.setNamePop !== 'function'
        ) {
            return false;
        }

        const original = Game_CharacterBase.prototype.setNamePop;
        const applyTranslation = (namePop) => this.applyNamePopTranslation(namePop);

        // Hook the narrowest stable method that receives the raw name text.
        // Both the plugin-command path and the meta-tag path call setNamePop with
        // the raw (pre-escape-conversion) name string, so we intercept here to
        // substitute the cached translation before the original method processes it.
        Game_CharacterBase.prototype.setNamePop = function (namePop, shiftY) {
            let translatedName = namePop;
            try {
                translatedName = applyTranslation(namePop);
            } catch (error) {
                console.warn('[TMNamePopTranslator] Failed to apply cached translation', error);
            }
            return original.call(this, translatedName, shiftY);
        };

        return true;
    }

    tryHookLegacyUpdateNamePop() {
        const SpriteCharacter = globalThis.Sprite_Character;

        if (typeof SpriteCharacter?.prototype?.updateNamePop !== 'function') {
            return false;
        }

        const original = SpriteCharacter.prototype.updateNamePop;
        const applyTranslation = (namePop) => this.applyNamePopTranslation(namePop);

        // Legacy TMNamePop keeps raw text in character._namePop and renders it from
        // Sprite_Character.updateNamePop, so temporarily swap in translated text
        // for that render pass while preserving the original source value.
        SpriteCharacter.prototype.updateNamePop = function () {
            const character = this._character;
            const originalNamePop = character?._namePop;
            let shouldRestore = false;

            if (typeof originalNamePop === 'string' && originalNamePop.trim()) {
                try {
                    const translatedNamePop = applyTranslation(originalNamePop);
                    if (translatedNamePop !== originalNamePop) {
                        character._namePop = translatedNamePop;
                        shouldRestore = true;
                    }
                } catch (error) {
                    console.warn('[TMNamePopTranslator] Failed to apply cached translation', error);
                }
            }

            try {
                return original.call(this);
            } finally {
                if (shouldRestore && character) {
                    character._namePop = originalNamePop;
                }
            }
        };

        return true;
    }

    enablePluginTranslation() {
        if (this.tryHookSetNamePop()) {
            return true;
        }

        return this.tryHookLegacyUpdateNamePop();
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
                console.warn('[TMNamePopTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];
        this.collectCommonEventEntries(entries);
        await this.collectMapEntries(entries);
        return entries;
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

            this.collectNamePopFromList(
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
                console.warn(`[TMNamePopTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    collectMapEventEntries(events, mapId, output) {
        for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
            const event = events[eventIdx];
            if (!event) {
                continue;
            }

            this.collectEventNoteEntry(event, mapId, eventIdx, output);
            this.collectEventPageEntries(event, mapId, eventIdx, output);
        }
    }

    collectEventNoteEntry(event, mapId, eventIdx, output) {
        const note = typeof event.note === 'string' ? event.note : '';
        if (!note) {
            return;
        }

        const match = NAME_POP_TAG_REGEX.exec(note);
        const name = match?.[1] ? extractNameFromTagValue(match[1]) : null;
        if (name?.trim()) {
            output.push({ text: name, source: { scope: 'eventNote', mapId, eventIdx } });
        }
    }

    collectEventPageEntries(event, mapId, eventIdx, output) {
        if (!Array.isArray(event.pages)) {
            return;
        }

        for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
            const page = event.pages[pageIdx];
            if (!page || !Array.isArray(page.list)) {
                continue;
            }

            this.collectNamePopFromList(
                page.list,
                { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                output
            );
        }
    }

    // Collects namePop text from a command list via:
    //   - MV plugin commands (code 356): "namePop <eventId> <name> [shiftY] [outlineColor]"
    //   - MV plugin commands (code 356): "TMNamePop set <eventId> <name> [shiftY] [outlineColor]"
    //   - Comment block tags (code 108/408): <namePop:name [shiftY] [outlineColor]>
    collectNamePopFromList(list, baseMeta, output) {
        if (!Array.isArray(list) || !Array.isArray(output)) {
            return;
        }

        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd) {
                continue;
            }

            const code = Number(cmd.code);

            if (code === 356) {
                this.pushPluginCommandEntry(cmd, cmdIdx, baseMeta, output);
            } else if (code === 108 || code === 408) {
                this.pushCommentTagEntry(cmd, cmdIdx, baseMeta, output);
            }
        }
    }

    pushPluginCommandEntry(cmd, cmdIdx, baseMeta, output) {
        const text = this.extractNameFromPluginCommand(cmd);
        if (text?.trim()) {
            output.push({ text, source: { ...baseMeta, cmdIdx } });
        }
    }

    pushCommentTagEntry(cmd, cmdIdx, baseMeta, output) {
        const commentText = String(cmd.parameters?.[0] || '');
        const match = NAME_POP_TAG_REGEX.exec(commentText);
        const name = match?.[1] ? extractNameFromTagValue(match[1]) : null;
        if (name?.trim()) {
            output.push({ text: name, source: { ...baseMeta, cmdIdx } });
        }
    }

    // Parses an MV plugin command event (code 356) and returns the name text, or null.
    // Command line formats:
    //   - "namePop <eventId> <nameText> [shiftY] [outlineColor]"
    //   - "TMNamePop set <eventId> <nameText> [shiftY] [outlineColor]"
    // In RMMV, parameters[0] is the full command string.
    extractNameFromPluginCommand(cmd) {
        const commandLine = typeof cmd.parameters?.[0] === 'string' ? cmd.parameters[0] : '';
        if (!commandLine.trim()) {
            return null;
        }

        const parts = commandLine.trim().split(/\s+/);
        const commandName = String(parts[0] || '')
            .trim()
            .toLowerCase();

        if (commandName === NAME_POP_COMMAND) {
            // parts[0] = 'namePop', parts[1] = eventId, parts[2] = name text
            return String(parts[2] || '').trim() || null;
        }

        if (
            commandName === TM_NAME_POP_COMMAND &&
            String(parts[1] || '')
                .trim()
                .toLowerCase() === TM_NAME_POP_SET_SUBCOMMAND
        ) {
            // parts[0] = 'TMNamePop', parts[1] = 'set', parts[2] = eventId, parts[3] = name text
            return String(parts[3] || '').trim() || null;
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
                    id: `plugin_tm_name_pop_${byCacheKey.size}`,
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
