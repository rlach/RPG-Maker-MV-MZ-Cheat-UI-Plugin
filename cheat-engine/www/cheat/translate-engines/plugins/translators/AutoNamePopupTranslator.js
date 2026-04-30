import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * AutoNamePopup compatibility fix translator.
 *
 * AutoNamePopup (Ver.5) hooks Game_Interpreter#command101 and prepends a
 * per-character optionString (e.g. "\SE[1]") to the first message line each
 * time a Show Text command runs.  When the game author has already embedded
 * that same optionString in the raw event data (code-401 parameters[0]), the
 * result inside $gameMessage._texts[0] has two consecutive copies of the
 * prefix (e.g. "\SE[1]\SE[1]（……").
 *
 * The translation runtime builds its cache key from $gameMessage.allText().
 * That key never matches the one built by the scan phase from the raw event
 * data (single prefix), so translations are never applied.
 *
 * Fix: hook Game_Message.prototype.allText (the sole observation point used by
 * the runtime's canStart hook) to normalise one duplicate leading optionString.
 * This approach operates at observation time and is therefore independent of
 * the command101 hook installation order and the 2-second plugin-detection
 * delay.
 *
 * No text extraction or cache entries are needed — all translatable strings are
 * captured by the standard message-scanning pipeline.
 */
export class AutoNamePopupTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'AutoNamePopup';
    }

    getPluginLabel() {
        return 'AutoNamePopup';
    }

    getCacheType() {
        return 'plugin_auto_name_popup';
    }

    enablePluginTranslation() {
        const translator = this;

        if (!window.Game_Message || !Game_Message.prototype) {
            return;
        }

        const originalAllText = Game_Message.prototype.allText;

        Game_Message.prototype.allText = function () {
            const text = originalAllText.call(this);
            try {
                if (
                    text &&
                    typeof this._faceName === 'string' &&
                    this._faceName.trim() &&
                    window.$gameSystem &&
                    typeof $gameSystem.getNameKeyParam === 'function'
                ) {
                    const faceIndex = typeof this._faceIndex === 'number' ? this._faceIndex : 0;
                    const key = [this._faceName, faceIndex];
                    const optionString = $gameSystem.getNameKeyParam(key, 'optionString');

                    // Strip exactly one duplicate leading optionString so the result
                    // matches the raw event-data text that was scanned for translation.
                    if (optionString && text.startsWith(optionString + optionString)) {
                        return text.slice(optionString.length);
                    }
                }
            } catch (error) {
                console.warn('[AutoNamePopupTranslator] allText normalisation failed', error);
            }
            return text;
        };

        /**
         * Extract plain text by removing RPG Maker control characters.
         * Preserves the structure to detect formatting later.
         */
        const extractPlainText = (text) => {
            if (!text || typeof text !== 'string') {
                return text;
            }
            // Remove RPG Maker escape sequences: \c[N], \n[N], \v[N], \p[N], \g, \>, \<, \., \!, \|, \^, \$
            return text
                .replace(/\\[cCnNvVpPgG]\[\d+\]/g, '')
                .replace(/\\[cCnNvVpPgG]/g, '')
                .replace(/\\[.!<>|^$]/g, '')
                .trim();
        };

        /**
         * Build a template string from speaker name by replacing the plain text
         * with a placeholder, then later replace the placeholder with translation.
         * Example: '\>\c[14]よしひろ\c[0]' with plain='よしひろ' becomes template='\>\c[14]%TRANSLATED%\c[0]'
         */
        const buildTemplate = (text, plainText) => {
            if (!plainText || !text || !text.includes(plainText)) {
                return null;
            }
            return text.replace(plainText, '%TRANSLATED%');
        };

        const originalSetSpeakerName = Game_Message.prototype.setSpeakerName;

        Game_Message.prototype.setSpeakerName = function (speakerName) {
            originalSetSpeakerName.call(this, speakerName);

            try {
                const runtime = translator.getRuntime();
                if (
                    speakerName &&
                    typeof speakerName === 'string' &&
                    speakerName.trim() &&
                    runtime
                ) {
                    // Extract plain text (without control characters)
                    const plainText = extractPlainText(speakerName);
                    if (!plainText) {
                        return; // No plain text left after stripping control chars
                    }

                    const cacheKey = runtime.getCacheKey(plainText, 'speaker');
                    if (runtime.hasUsableCacheValue(cacheKey)) {
                        const translated = runtime.translationCache.get(cacheKey);
                        if (typeof translated === 'string' && translated.trim()) {
                            // Build template from original speaker name
                            const template = buildTemplate(speakerName, plainText);
                            if (template) {
                                // Replace placeholder with translated text
                                this._speakerName = template.replace('%TRANSLATED%', translated);
                            } else {
                                // Fallback: just use translation if template extraction fails
                                this._speakerName = translated;
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('[AutoNamePopupTranslator] Speaker name translation failed', error);
            }
        };
    }

    collectUntranslated() {
        // No text extraction needed — all message text is picked up by the standard
        // message scanner.  This translator only installs a runtime compatibility fix.
        return [];
    }

    countPluginAmountSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
