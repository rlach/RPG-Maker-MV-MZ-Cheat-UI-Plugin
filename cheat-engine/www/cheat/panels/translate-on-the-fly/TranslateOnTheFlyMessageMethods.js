import { Alert } from '../../js/AlertHelper.js';
import { createTranslationBatchManager } from '../../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import { wrapTextByVisibleWidth } from './TextWrap.js';

export const translateOnTheFlyMessageMethods = {
    replaceMessageText(translatedText) {
        // Do NOT extract \n<...> as speaker - these are RPG Maker script elements/plugin commands
        // Speaker name comes from $gameMessage._speakerName, not from text

        const safeText = String(translatedText || '');

        // Split translated text into lines
        const lines = safeText.split('\n');

        // Clear current message texts
        $gameMessage._texts.length = 0;

        // Add translated lines (preserving all RPG Maker tags)
        // Keep leading/internal empty lines, but skip trailing empty-only padding.
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

        // After modifying $gameMessage._texts we must also reset the message window's
        // _textState, because startMessage() already copied the old text into _textState.text
        // and the window renders exclusively from that — it never re-reads $gameMessage._texts.
        const msgWindow = this.currentMessageWindow;
        if (!msgWindow) {
            return;
        }

        // Build a proper textState. MZ uses createTextState() which sets rtl/buffer/drawing etc.
        // MV uses a plain object — the plain fallback is fine there.
        const makeTextState = (text) => {
            if (typeof msgWindow.createTextState === 'function') {
                // MZ path: createTextState already calls convertEscapeCharacters internally
                const ts = msgWindow.createTextState(text, 0, 0, 0);
                ts.x = typeof msgWindow.newLineX === 'function' ? msgWindow.newLineX(ts) : 0;
                ts.startX = ts.x;
                return ts;
            }
            // MV path: plain object, convertEscapeCharacters called separately
            const converted =
                typeof msgWindow.convertEscapeCharacters === 'function'
                    ? msgWindow.convertEscapeCharacters(text)
                    : text;
            return { index: 0, text: converted };
        };

        if (msgWindow._textState) {
            // Message is currently scrolling — replace the live textState.
            msgWindow._textState = makeTextState(safeText);
            if (typeof msgWindow.newPage === 'function') {
                msgWindow.newPage(msgWindow._textState);
            }
        } else if (msgWindow.pause) {
            // Message finished scrolling and is waiting for player input (pause state).
            // _textState is null here; updateInput() blocks updateMessage() while pause=true,
            // so we must clear pause before injecting _textState, otherwise the canvas stays
            // blank until the player presses the action button.
            msgWindow._textState = makeTextState(safeText);
            if (typeof msgWindow.newPage === 'function') {
                msgWindow.newPage(msgWindow._textState);
            }
            // Show the new text instantly — no character-by-character scrolling needed.
            msgWindow._showFast = true;
            msgWindow.pause = false;
            msgWindow._waitCount = 0;
        }
    },

    replaceChoiceText(translatedChoices) {
        if (!Array.isArray(translatedChoices)) {
            return;
        }

        $gameMessage._choices = translatedChoices.slice();
    },

    replaceSpeakerName(translatedSpeaker) {
        const safeSpeaker = this.normalizeSpeakerNameCase((translatedSpeaker || '').trim());
        if (!safeSpeaker) {
            return;
        }

        $gameMessage._speakerName = safeSpeaker;
    },

    protectSpecialSequences(text) {
        // Store original sequences with placeholders
        const protectedSequences = [];
        let protectedText = text;

        // Protect RPG Maker control characters and escape sequences
        const patterns = [
            /\\[nNpPgGcCiI]\[(\d+)\]/g, // \n[1], \p[2], etc.
            /\\[vV]\[(\d+)\]/g, // \v[1] - variables
            /\\[cC]\[(\d+)\]/g, // \c[1] - colors
            /\\[gG]/g, // \g - gold
            /\\[.!><|^$]/g, // \., \!, \>, \<, \|, \^, \$
            /\n/g, // newlines
            /\\n/g, // literal \n
            /\\\\/g, // escaped backslashes
        ];

        patterns.forEach((pattern, index) => {
            protectedText = protectedText.replace(pattern, (match) => {
                const placeholder = `XPROTX${protectedSequences.length}XPROTX`;
                protectedSequences.push(match);
                return placeholder;
            });
        });

        return { protectedText, protectedSequences };
    },

    restoreSpecialSequences(text, protectedSequences) {
        let restoredText = text;

        // Restore all protected sequences
        protectedSequences.forEach((sequence, index) => {
            const placeholder = `XPROTX${index}XPROTX`;
            // Handle various possible mutations by the translator
            const patterns = [
                new RegExp(placeholder, 'g'),
                new RegExp(placeholder.replace(/X/g, 'X\\s*'), 'g'),
                new RegExp('X\\s*PROT\\s*X\\s*' + index + '\\s*X\\s*PROT\\s*X', 'g'),
                new RegExp('XPROT X' + index + 'X PROTX', 'g'),
                new RegExp('X PROT X' + index + 'X PROT X', 'g'),
            ];

            patterns.forEach((pattern) => {
                restoredText = restoredText.replace(pattern, sequence);
            });
        });

        return restoredText;
    },

    cleanTranslatedText(text) {
        let cleaned = text;

        // Remove spaces after > before " (for dialogue)
        cleaned = cleaned.replace(/>\s+"/g, '">"');
        cleaned = cleaned.replace(/>\s+'/g, ">'");
        cleaned = cleaned.replace(/>\s+「/g, '>「');
        cleaned = cleaned.replace(/>\s+『/g, '>『');

        // Fix common API spacing issues in escape sequences
        cleaned = cleaned.replace(/\\\s+n/g, '\\n');
        cleaned = cleaned.replace(/\\\s+c/g, '\\c');
        cleaned = cleaned.replace(/\\\s+v/g, '\\v');
        cleaned = cleaned.replace(/\\\s+p/g, '\\p');
        cleaned = cleaned.replace(/\\\s+g/g, '\\g');

        return cleaned;
    },

    wrapText(text, maxWidth, options = {}) {
        if (!this.enableTextWrapping || !maxWidth || maxWidth <= 0) {
            return text;
        }

        return wrapTextByVisibleWidth(text, maxWidth, {
            flattenExistingNewlines: !!(options && options.flattenExistingNewlines),
            tagEntries: this.engine?.tagManager?.tagEntries,
        });
    },

    async translateCommandName(commandName) {
        try {
            const cleanName = (commandName || '').trim();
            if (!cleanName) {
                return commandName;
            }

            const sourceName = this.getCanonicalSystemCommandName(cleanName);

            const commandKey = this.getCacheKey(sourceName, 'command');

            // Check cache first
            if (this.hasUsableCacheValue(commandKey)) {
                this.trackCacheKeyUsage(commandKey, { harvestMissing: false });
                return this.translationCache.get(commandKey);
            }

            // If translation is in progress, return original for now
            if (this.pendingTranslations.has(commandKey)) {
                return commandName;
            }

            if (!this.batchManager) {
                this.batchManager = createTranslationBatchManager(this);
            }
            const result = await this.batchManager.runBatchedTranslation([
                {
                    kind: 'directItems',
                    items: [
                        {
                            type: 'command',
                            id: 'cmd_0',
                            value: sourceName,
                            cacheKey: commandKey,
                        },
                    ],
                    translationPhaseLabel: 'translating menu options',
                    backgroundJob: false,
                    itemLimit: this.batchItemsLimit || 20,
                    charLimit: this.charLimit || 1000,
                    showSummary: false,
                },
            ]);

            if (result.successes.length > 0) {
                const translated = result.successes[0].translated;
                this.setCacheValue(commandKey, translated);
                return translated;
            }

            if (result.failures.length > 0) {
                console.warn(
                    '[TranslateOnTheFly] Failed to translate command:',
                    sourceName,
                    '→',
                    result.failures[0].rejectReason
                );
                this.markBatchFailuresAsUntranslated(result.failures, true);
            }

            return commandName;
        } catch (error) {
            console.error('[TranslateOnTheFly] Command translation error:', error);
            return commandName;
        }
    },

    async translateChoiceText(text) {
        try {
            const cleanText = (text || '').trim();
            if (!cleanText) {
                return text;
            }

            const { protectedText, protectedSequences } = this.protectSpecialSequences(cleanText);
            const translatedRaw = await this.translateWithSelectedEngine(protectedText);

            if (translatedRaw) {
                let translated = this.restoreSpecialSequences(translatedRaw, protectedSequences);
                translated = this.cleanTranslatedText(translated);
                // choices are not wrapped — they display in a fixed-size window
                return translated;
            }

            return text;
        } catch (error) {
            console.error('[TranslateOnTheFly] Choice translation API error:', error);
            return text;
        }
    },

    async translateChoices(choices) {
        if (!Array.isArray(choices) || !choices.length) {
            return { choices: choices || [], complete: true };
        }

        // Build items for uncached choices
        const items = choices
            .map((choice, i) => {
                const cacheKey = this.getCacheKey(choice, 'choice');
                return {
                    type: 'choice',
                    id: `choice_${i}`,
                    value: choice,
                    cacheKey,
                };
            })
            .filter((item) => !this.hasUsableCacheValue(item.cacheKey));

        if (items.length === 0) {
            // All individual choices cached, build result
            const translatedChoices = choices.map((choice) => {
                const cacheKey = this.getCacheKey(choice, 'choice');
                return this.translationCache.get(cacheKey) || choice;
            });
            return { choices: translatedChoices, complete: true };
        }

        // Translate uncached choices
        if (!this.batchManager) {
            this.batchManager = createTranslationBatchManager(this);
        }
        const result = await this.batchManager.runBatchedTranslation([
            {
                kind: 'directItems',
                items,
                translationPhaseLabel: 'translating choices',
                backgroundJob: false,
                itemLimit: this.batchItemsLimit || 20,
                charLimit: this.charLimit || 1000,
                showSummary: false,
            },
        ]);

        // Apply successes to cache
        for (const success of result.successes) {
            this.setCacheValue(success.cacheKey, success.translated);
        }

        // Build final choice array
        const translatedChoices = choices.map((choice) => {
            const cacheKey = this.getCacheKey(choice, 'choice');
            return this.translationCache.get(cacheKey) || choice;
        });

        const complete = result.failures.length === 0;
        if (!complete) {
            this.markBatchFailuresAsUntranslated(result.failures, true);
        }

        return { choices: translatedChoices, complete };
    },

    async translateSpeakerName(speakerName) {
        try {
            const cleanName = (speakerName || '').trim();
            if (!cleanName) {
                return speakerName;
            }

            const translated = await this.translateWithSelectedEngine(cleanName, {
                skipWrap: true,
            });
            return this.normalizeSpeakerNameCase(translated || speakerName);
        } catch (error) {
            console.error('[TranslateOnTheFly] Speaker name translation API error:', error);
            return speakerName;
        }
    },

    normalizeSpeakerNameCase(name) {
        if (!name || typeof name !== 'string') {
            return name;
        }

        // Capitalize first latin letter if present (helps translators that lowercase names)
        return name.replace(/^([a-z])/, (match) => match.toUpperCase());
    },

    async translateWithSelectedEngine(text, options = {}) {
        const sourceLang = this.sourceLang || 'auto';
        const targetLang = this.targetLang || 'en';
        const payload = text === null || text === undefined ? '' : String(text);

        if (!payload.trim()) {
            return text;
        }

        // Delegate to engine
        return await this.engine.translate(payload, sourceLang, targetLang, options);
    },

    isEngineFullyConfigured() {
        if (!this.engine) {
            return false;
        }

        return this.engine.isFullyConfigured();
    },

    async translateAndApplyCurrentMessage() {
        try {
            const gameMessage = this.currentGameMessage || $gameMessage;
            if (!gameMessage) {
                console.warn('[TranslateOnTheFly] No gameMessage available');
                return;
            }
            if (!this.engine) {
                console.error('[TranslateOnTheFly] No engine available', {
                    hasEngine: !!this.engine,
                    engineType: this.engine ? this.engine.constructor.name : 'null',
                });
                Alert.error('Translation engine not initialized');
                return;
            }
            if (!this.batchManager) {
                this.batchManager = createTranslationBatchManager(this);
            }
            await this.batchManager.runBatchedTranslation(
                [
                    {
                        kind: 'currentEvent',
                        fullEvent: false,
                        forceRefreshCache: true,
                    },
                ],
                {
                    translationPhaseLabel: 'OTF - translating current message',
                    backgroundJob: false,
                    showSummary: false,
                }
            );
        } catch (error) {
            console.error('[TranslateOnTheFly] Translation error:', error);
            this.hideSpinner();
        }
    },
};
