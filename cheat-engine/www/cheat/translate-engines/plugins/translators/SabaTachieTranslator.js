/**
 * SabaTachieTranslator — runtime translation hook for the Saba_Tachie plugin.
 *
 * Plugin: Saba_Tachie (立ち絵プラグイン)
 * Author: Sabakan
 * Version: ~2016-08-19 (MV only)
 * Companion plugins: Saba_BackLog, Saba_Performance (SabaSabaSaba.js)
 *
 * Saba_Tachie replaces the standard Window_Message with Window_TachieMessage
 * (visual-novel style message window). Key architectural differences:
 *
 *  - Window_TachieMessage extends Window_Message but overrides terminateMessage
 *    WITHOUT calling super. This means the cheat engine's Window_Message.terminateMessage
 *    cleanup (which deletes _translateOriginalText, _translateOriginalChoices, etc.)
 *    never executes, causing stale state between messages.
 *
 *  - The cheat engine's Window_Message.prototype.canStart hook is inherited by
 *    Window_TachieMessage. That hook blocks message display (returns false) while
 *    waiting for translations, which conflicts with Tachie's message flow (especially
 *    the notClose/tachieAvairable mode where the window stays open between messages).
 *
 *  - Window_TachieMessage is NOT globally accessible as window.Window_TachieMessage.
 *    It lives at Saba.Tachie.Window_TachieMessage (inside a TypeScript-compiled IIFE).
 *
 *  - Speaker names are set via the "Tachie showName <name>" plugin command (MV code 356)
 *    and stored in $gameTemp.tachieName. MV lacks native _speakerName, so Tachie uses its
 *    own Window_MessageName sub-window to display names. Names are stored in the 'speaker'
 *    cache type (aliased to 'actor_name' by the runtime's getCacheKey).
 *
 * This translator:
 *  1. Resolves the class via Saba.Tachie namespace (with window global fallback).
 *  2. Overrides canStart on the Tachie prototype to bypass the main engine's
 *     translation hook — all translation is handled in the startMessage hook instead.
 *  3. Applies cached text/choice/speaker translations before the original startMessage
 *     reads $gameMessage._texts / allText() / $gameTemp.tachieName.
 *  4. Tracks seen keys for text, choices, and speaker names.
 *  5. Cleans up stale translation state in terminateMessage.
 *  6. Scans maps and common events for "Tachie showName" plugin commands to collect
 *     speaker names for mass translation (stored in actor_name cache).
 */
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { loadMapDataById } from '../../../js/translation-runtime/ObjectTranslationModalMethods.js';

// MV plugin command prefix and subcommand for speaker names.
const TACHIE_COMMAND = 'tachie';
const TACHIE_COMMAND_JP = '立ち絵';
const SHOW_NAME_SUBCOMMAND = 'showname';

// Speaker names use the 'speaker' type which getCacheKey aliases to 'actor_name'.
const NAME_CACHE_TYPE = 'speaker';

/**
 * Parse a Tachie MV plugin command line and return the speaker name, or null.
 * Format: "Tachie showName <name>" or "立ち絵 showName <name>"
 */
function extractSpeakerNameFromPluginCommand(cmd) {
    const commandLine = typeof cmd.parameters?.[0] === 'string' ? cmd.parameters[0] : '';
    if (!commandLine.trim()) {
        return null;
    }

    const parts = commandLine.trim().split(/\s+/);
    const command = String(parts[0] || '').trim().toLowerCase();

    if (command !== TACHIE_COMMAND && command !== TACHIE_COMMAND_JP) {
        return null;
    }

    if (String(parts[1] || '').trim().toLowerCase() !== SHOW_NAME_SUBCOMMAND) {
        return null;
    }

    // parts[2] is the speaker name. It may contain spaces if the game dev
    // used a single-token name, but Saba_Tachie reads args[1] which is
    // the second space-separated token after the command prefix.
    const name = String(parts[2] || '').trim();
    return name || null;
}

export class SabaTachieTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'Saba_Tachie';
    }

    getPluginLabel() {
        return 'Saba Tachie';
    }

    getCacheType() {
        return 'message';
    }

    /**
     * Resolve the Window_TachieMessage constructor.
     * The class is typically at Saba.Tachie.Window_TachieMessage (IIFE-scoped),
     * but some game builds may expose it as a window global.
     */
    _resolveTachieMessageClass() {
        return (
            window.Saba?.Tachie?.Window_TachieMessage ||
            globalThis['Window_TachieMessage'] ||
            null
        );
    }

    enablePluginTranslation() {
        const TachieMessageClass = this._resolveTachieMessageClass();
        if (!TachieMessageClass?.prototype) {
            return;
        }

        const originalStartMessage = TachieMessageClass.prototype.startMessage;
        const originalTerminateMessage = TachieMessageClass.prototype.terminateMessage;
        const translator = this;

        // --- Bypass the main engine's canStart hook for Tachie messages ---
        // The main engine patches Window_Message.prototype.canStart to block until
        // translation is ready. Since Window_TachieMessage inherits from Window_Message,
        // it picks up that patch, which conflicts with Tachie's flow (blocks indefinitely,
        // stale _translateOriginalText causes wrong cache keys, choices get stuck).
        //
        // Override canStart on the Tachie prototype to use the vanilla behavior.
        // Translation is handled entirely in the startMessage hook below.
        const vanillaCanStart =
            Window_Message.prototype._originalCanStart || Window_Message.prototype.canStart;
        TachieMessageClass.prototype.canStart = vanillaCanStart;

        // --- Apply translation before startMessage reads the text ---
        TachieMessageClass.prototype.startMessage = function () {
            try {
                translator._applyTachieTranslation();
            } catch (error) {
                console.warn('[SabaTachieTranslator] Failed to process message', error);
            }
            originalStartMessage.call(this);
        };

        // --- Clean up stale translation state between messages ---
        // Tachie's terminateMessage does not call super, so the cheat engine's
        // Window_Message.terminateMessage patch never fires.
        TachieMessageClass.prototype.terminateMessage = function () {
            this._translationApplied = false;
            if (window.$gameMessage) {
                delete $gameMessage._translateOriginalText;
                delete $gameMessage._translateOriginalChoices;
                delete $gameMessage._translateOriginalSpeaker;
            }
            originalTerminateMessage.call(this);
        };
    }

    /**
     * Read the original (pre-translation) message text from $gameMessage.
     * Prefers a previously frozen snapshot to avoid reading already-translated text.
     */
    _resolveOriginalText() {
        if (!window.$gameMessage) {
            return '';
        }

        if (typeof $gameMessage._translateOriginalText === 'string') {
            return $gameMessage._translateOriginalText;
        }

        const text = typeof $gameMessage.allText === 'function' ? $gameMessage.allText() : '';
        return typeof text === 'string' ? text : '';
    }

    /**
     * Replace $gameMessage._texts with lines from the translated string.
     * Preserves leading/internal empty lines but trims trailing empty padding.
     */
    _applyTranslatedLines(translatedText) {
        if (!Array.isArray($gameMessage._texts)) {
            return;
        }

        const lines = translatedText.split('\n');
        $gameMessage._texts.length = 0;

        const lastNonEmptyIndex = (() => {
            for (let i = lines.length - 1; i >= 0; i--) {
                if (lines[i] !== '') {
                    return i;
                }
            }
            return -1;
        })();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (lines.length === 1) {
                $gameMessage._texts.push(line);
                continue;
            }

            const isLeadingOrInternalEmpty = line === '' && i <= lastNonEmptyIndex;
            if (line !== '' || isLeadingOrInternalEmpty) {
                $gameMessage._texts.push(line);
            }
        }
    }

    /**
     * Core translation hook — runs before the original startMessage.
     * Handles text, choices, and seen tracking for the current Tachie message.
     */
    _applyTachieTranslation() {
        const runtime = this.getRuntime();
        if (!runtime || !this.isRuntimeTranslationActive(runtime)) {
            return;
        }

        // --- Text translation ---
        const originalText = this._resolveOriginalText();

        // Freeze original text once for stable cache key lookups
        if (originalText && $gameMessage._translateOriginalText === undefined) {
            $gameMessage._translateOriginalText = originalText;
        }

        if (originalText?.trim()) {
            const hasPortrait = runtime.hasCurrentMessagePortrait($gameMessage);
            const entry = runtime.getPreferredMessageCacheEntry(originalText, { hasPortrait });

            if (entry && typeof entry.value === 'string' && entry.value.trim()) {
                this._applyTranslatedLines(entry.value);
                // getPreferredMessageCacheEntry already tracks the resolved key internally,
                // but also track explicitly so seen always updates even on fast skipping.
                runtime.trackCacheKeyUsage(entry.cacheKey);
            } else {
                // No cached translation — harvest the key for batch translation.
                const messageType = hasPortrait ? 'message_portrait' : 'message';
                const cacheKey = runtime.getCacheKey(originalText, messageType);
                runtime.trackCacheKeyUsage(cacheKey);
            }
        }

        // --- Choice translation ---
        const choices = ($gameMessage.choices && $gameMessage.choices()) || [];
        if (Array.isArray(choices) && choices.length > 0) {
            // Freeze source choices once so translated replacements never become cache keys
            if (!Array.isArray($gameMessage._translateOriginalChoices)) {
                $gameMessage._translateOriginalChoices = choices.slice();
            }
            const originalChoices = $gameMessage._translateOriginalChoices;

            let anyTranslated = false;
            const translatedChoices = originalChoices.map((choice) => {
                const choiceKey = runtime.getCacheKey(choice, 'choice');
                runtime.trackCacheKeyUsage(choiceKey);
                if (runtime.hasUsableCacheValue(choiceKey)) {
                    anyTranslated = true;
                    return runtime.translationCache.get(choiceKey);
                }
                return choice;
            });

            if (anyTranslated) {
                $gameMessage._choices = translatedChoices.slice();
            }
        }

        // --- Speaker name translation ---
        const speakerName = window.$gameTemp?.tachieName;
        if (typeof speakerName === 'string' && speakerName.trim()) {
            const speakerKey = runtime.getCacheKey(speakerName, NAME_CACHE_TYPE);
            runtime.trackCacheKeyUsage(speakerKey);
            if (runtime.hasUsableCacheValue(speakerKey)) {
                const cached = runtime.translationCache.get(speakerKey);
                if (typeof cached === 'string' && cached.trim()) {
                    $gameTemp.tachieName = cached;
                }
            }
        }
    }

    // ========================================================================
    // Scanning — collect speaker names from "Tachie showName" plugin commands
    // ========================================================================

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

        this._scanPromise = this._buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[SabaTachieTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async _buildScanEntries() {
        const entries = [];
        this._collectCommonEventEntries(entries);
        await this._collectMapEntries(entries);
        return entries;
    }

    _collectCommonEventEntries(output) {
        if (!Array.isArray(window.$dataCommonEvents)) {
            return;
        }

        for (let i = 0; i < $dataCommonEvents.length; i++) {
            const commonEvent = $dataCommonEvents[i];
            if (!commonEvent || !Array.isArray(commonEvent.list)) {
                continue;
            }

            this._collectNamesFromList(commonEvent.list, { scope: 'commonEvent', commonEventId: i }, output);
        }
    }

    async _collectMapEntries(output) {
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

                        this._collectNamesFromList(
                            page.list,
                            { scope: 'mapEvent', mapId, eventIdx, pageIdx },
                            output
                        );
                    }
                }
            } catch (error) {
                console.warn(`[SabaTachieTranslator] Failed to scan map ${mapId}`, error);
            }
        }
    }

    _collectNamesFromList(list, baseMeta, output) {
        for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
            const cmd = list[cmdIdx];
            if (!cmd || Number(cmd.code) !== 356) {
                continue;
            }

            const name = extractSpeakerNameFromPluginCommand(cmd);
            if (name) {
                output.push({ text: name, source: { ...baseMeta, cmdIdx } });
            }
        }
    }

    _buildUniquePendingItems(runtime) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text?.trim()) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, NAME_CACHE_TYPE);
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: NAME_CACHE_TYPE,
                    id: `plugin_saba_tachie_name_${byCacheKey.size}`,
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

        const items = this._buildUniquePendingItems(runtime);
        return items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this._buildUniquePendingItems(runtime);
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
