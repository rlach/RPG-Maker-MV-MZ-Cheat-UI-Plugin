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

// MV plugin command prefix and subcommand for speaker names.
const TACHIE_COMMAND = 'tachie';
const TACHIE_COMMAND_JP = '立ち絵';
const SHOW_NAME_SUBCOMMAND = 'showname';

// Speaker names use the 'speaker' type which getCacheKey aliases to 'actor_name'.
const NAME_CACHE_TYPE = 'speaker';

/**
 * Parse a Tachie MV plugin command line and return the speaker name, or null.
 * Format: "Tachie showName <name>" or "立ち絵 showName <name>"
 *
 * MV splits plugin commands by regular space (" ") only — NOT by all whitespace.
 * Names may contain full-width spaces (U+3000), escape codes like \\i[250], etc.
 * The name is everything after "showName " (the rest of args[1..] in MV terms).
 */
function extractSpeakerNameFromPluginCommand(cmd) {
    const commandLine = typeof cmd.parameters?.[0] === 'string' ? cmd.parameters[0] : '';
    if (!commandLine.trim()) {
        return null;
    }

    // Split on regular space only to match MV's command356 parsing behavior.
    const parts = commandLine.split(' ');
    const command = String(parts[0] || '').trim().toLowerCase();

    if (command !== TACHIE_COMMAND && command !== TACHIE_COMMAND_JP) {
        return null;
    }

    if (String(parts[1] || '').trim().toLowerCase() !== SHOW_NAME_SUBCOMMAND) {
        return null;
    }

    // In MV, Game_Interpreter.command356 does: args = params[0].split(" "); command = args.shift();
    // Then pluginCommand(command, args) is called with args = ["showName", "<name>"]
    // Saba_Tachie reads args[1] which is parts[2] here (everything in that single token).
    // However some games may have the name as multiple space-separated tokens after showName.
    // Join everything from parts[2] onward to handle both cases.
    const name = parts.slice(2).join(' ').trim();
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
            console.warn('[SabaTachieTranslator] Window_TachieMessage not found at enablePluginTranslation time, deferring hook');
            this._deferHookInstallation();
            return;
        }

        this._installHooks(TachieMessageClass);
    }

    _deferHookInstallation() {
        let attempts = 0;
        const maxAttempts = 20;
        const interval = setInterval(() => {
            attempts++;
            const TachieMessageClass = this._resolveTachieMessageClass();
            if (TachieMessageClass?.prototype) {
                clearInterval(interval);
                console.log('[SabaTachieTranslator] Deferred hook: class found after', attempts, 'attempts');
                this._installHooks(TachieMessageClass);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.warn('[SabaTachieTranslator] Deferred hook: gave up after', maxAttempts, 'attempts');
            }
        }, 500);
    }

    _installHooks(TachieMessageClass) {
        const originalStartMessage = TachieMessageClass.prototype.startMessage;
        const originalTerminateMessage = TachieMessageClass.prototype.terminateMessage;
        const translator = this;

        // --- Bypass the main engine's canStart hook for Tachie messages ---
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
            // Speaker name must be translated AFTER originalStartMessage sets up the window
            // but BEFORE _messageNameWindow.draw reads tachieName — however Tachie draws
            // inside startMessage itself. So we also hook post-startMessage to re-draw
            // the name window with the translated name if a cached translation exists.
            try {
                translator._applyTachieNamePostDraw(this);
            } catch (error) {
                console.warn('[SabaTachieTranslator] Failed to apply name translation', error);
            }
        };

        // --- Clean up stale translation state between messages ---
        TachieMessageClass.prototype.terminateMessage = function () {
            this._translationApplied = false;
            if (window.$gameMessage) {
                delete $gameMessage._translateOriginalText;
                delete $gameMessage._translateOriginalChoices;
                delete $gameMessage._translateOriginalSpeaker;
            }
            originalTerminateMessage.call(this);
        };

        console.log('[SabaTachieTranslator] Hooks installed successfully');
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
     * Handles text, choices, speaker name and seen tracking for the current Tachie message.
     */
    _applyTachieTranslation() {
        const runtime = this.getRuntime();
        if (!runtime || !this.isRuntimeTranslationActive(runtime)) {
            return;
        }

        // --- Speaker name translation ---
        this._trackAndTranslateSpeakerName(runtime);

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
    }

    /**
     * Track speaker name and translate $gameTemp.tachieName if cached.
     */
    _trackAndTranslateSpeakerName(runtime) {
        const speakerName = $gameTemp?.tachieName;
        if (typeof speakerName !== 'string' || !speakerName.trim()) {
            return;
        }

        const speakerKey = runtime.getCacheKey(speakerName, NAME_CACHE_TYPE);
        runtime.trackCacheKeyUsage(speakerKey);

        if (runtime.hasUsableCacheValue(speakerKey)) {
            const cached = runtime.translationCache.get(speakerKey);
            if (typeof cached === 'string' && cached.trim()) {
                $gameTemp.tachieName = cached;
            }
        }
    }

    /**
     * Post-draw hook: after the original startMessage has already called
     * _messageNameWindow.draw(tachieName), re-draw with translated name
     * if translation was applied to $gameTemp.tachieName.
     * This handles the case where tachieName was translated but the original
     * startMessage already read the pre-translation value.
     */
    _applyTachieNamePostDraw(messageWindow) {
        const runtime = this.getRuntime();
        if (!runtime) {
            return;
        }

        const speakerName = $gameTemp?.tachieName;
        if (typeof speakerName !== 'string' || !speakerName.trim()) {
            return;
        }

        // If tachieName was already translated (in _applyTachieTranslation before
        // the original startMessage ran), the name window already has the right text.
        // But if translation happens to be available now (e.g. cache populated between
        // pre and post), apply it by re-drawing the name window.
        if (messageWindow._messageNameWindow && typeof messageWindow._messageNameWindow.draw === 'function') {
            const speakerKey = runtime.getCacheKey(speakerName, NAME_CACHE_TYPE);
            // Already tracked in _trackAndTranslateSpeakerName, just check cache
            if (runtime.hasUsableCacheValue(speakerKey)) {
                const cached = runtime.translationCache.get(speakerKey);
                if (typeof cached === 'string' && cached.trim() && cached !== speakerName) {
                    $gameTemp.tachieName = cached;
                    messageWindow._messageNameWindow.draw(cached);
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
