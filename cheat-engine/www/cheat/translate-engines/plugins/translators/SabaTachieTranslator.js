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
 * This translator:
 *  1. Resolves the class via Saba.Tachie namespace (with window global fallback).
 *  2. Overrides canStart on the Tachie prototype to bypass the main engine's
 *     translation hook — all translation is handled in the startMessage hook instead.
 *  3. Applies cached text/choice translations before the original startMessage reads
 *     $gameMessage._texts / allText().
 *  4. Tracks seen keys for text and choices.
 *  5. Cleans up stale translation state in terminateMessage.
 */
import { BasePluginTranslator } from '../BasePluginTranslator.js';

export class SabaTachieTranslator extends BasePluginTranslator {
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
            globalThis.Saba?.Tachie?.Window_TachieMessage ||
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
    }
}
