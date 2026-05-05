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

    enablePluginTranslation() {
        const TachieMessageClass = window['Window_TachieMessage'];
        if (!TachieMessageClass?.prototype) {
            return;
        }

        const originalStartMessage = TachieMessageClass.prototype.startMessage;
        const originalTerminateMessage = TachieMessageClass.prototype.terminateMessage;
        const applyTachieMessageHook = this.applyTachieMessageHook.bind(this);

        TachieMessageClass.prototype.startMessage = function () {
            try {
                applyTachieMessageHook();
            } catch (error) {
                console.warn('[SabaTachieTranslator] Failed to process message', error);
            }
            originalStartMessage.call(this);
        };

        // Tachie's terminateMessage does not call super, so the cheat engine's
        // Window_Message.terminateMessage patch never fires. Patch it here to ensure
        // _translationApplied and stale _translateOriginalText are cleaned up between messages.
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

    resolveOriginalText() {
        if (!window.$gameMessage) {
            return '';
        }

        if (typeof $gameMessage._translateOriginalText === 'string') {
            return $gameMessage._translateOriginalText;
        }

        const text = typeof $gameMessage.allText === 'function' ? $gameMessage.allText() : '';
        return typeof text === 'string' ? text : '';
    }

    applyTranslatedLines(translatedText) {
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

    applyTachieMessageHook() {
        const runtime = this.getRuntime();
        if (!runtime || !this.isRuntimeTranslationActive(runtime)) {
            return;
        }

        const originalText = this.resolveOriginalText();
        if (!originalText?.trim()) {
            return;
        }

        const hasPortrait =
            typeof runtime.hasCurrentMessagePortrait === 'function'
                ? runtime.hasCurrentMessagePortrait($gameMessage)
                : false;

        const entry =
            typeof runtime.getPreferredMessageCacheEntry === 'function'
                ? runtime.getPreferredMessageCacheEntry(originalText, { hasPortrait })
                : null;

        if (!entry || typeof entry.value !== 'string' || !entry.value.trim()) {
            // No cached translation yet — harvest the key so it can be submitted for translation.
            const messageType = hasPortrait ? 'message_portrait' : 'message';
            const cacheKey = runtime.getCacheKey(originalText, messageType);
            runtime.trackCacheKeyUsage(cacheKey);
            return;
        }

        // Apply translation to $gameMessage._texts before startMessage reads allText().
        this.applyTranslatedLines(entry.value);
    }
}
