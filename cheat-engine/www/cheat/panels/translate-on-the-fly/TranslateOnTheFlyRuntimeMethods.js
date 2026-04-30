import { createTranslationBatchManager } from '../../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../../translate-engines/plugins/PluginTranslatorRegistry.js';

export const translateOnTheFlyRuntimeMethods = {
    setupTranslationHook() {
        const self = this;
        const markCurrentMessageAsEventOrigin = (kind, interpreter) => {
            if (!window.$gameMessage) {
                return;
            }

            const eventId =
                interpreter && typeof interpreter._eventId === 'number' ? interpreter._eventId : 0;

            $gameMessage._translateMessageOrigin = {
                source: 'event',
                kind,
                eventId,
                at: Date.now(),
            };
        };

        const clearCurrentMessageOrigin = () => {
            if (!window.$gameMessage) {
                return;
            }

            delete $gameMessage._translateMessageOrigin;
        };

        const isBattleSystemMessage = () => {
            if (!window.$gameMessage) {
                return false;
            }

            const inBattle = !!(
                window.$gameParty &&
                typeof $gameParty.inBattle === 'function' &&
                $gameParty.inBattle()
            );

            if (!inBattle) {
                return false;
            }

            const origin = $gameMessage._translateMessageOrigin;
            if (origin && origin.source === 'event') {
                return false;
            }

            const interpreter =
                typeof self.findMessageInterpreter === 'function'
                    ? self.findMessageInterpreter()
                    : null;
            if (interpreter && interpreter._waitMode === 'message') {
                return false;
            }

            return true;
        };

        const applyLifecycleTranslations = (trigger) => {
            const shouldApplyLifecycleCache =
                self.isTranslationEnabled() ||
                !!self.translateCacheWhenDisabled ||
                (typeof self.isNonOtfTranslationProcessActive === 'function' &&
                    self.isNonOtfTranslationProcessActive());

            if (!shouldApplyLifecycleCache) {
                return;
            }

            if (!self.batchManager) {
                self.batchManager = createTranslationBatchManager(self);
            }

            if (self.batchManager?.applyDataOnLifecycle) {
                self.batchManager.applyDataOnLifecycle({ trigger });
            }
        };

        const shouldReturnTranslatedVariableValue = () => {
            return (
                self.isTranslationEnabled() ||
                !!self.translateCacheWhenDisabled ||
                (typeof self.isNonOtfTranslationProcessActive === 'function' &&
                    self.isNonOtfTranslationProcessActive())
            );
        };

        const applyCurrentMapDisplayNameFromCache = () => {
            if (!window.$dataMap || typeof $dataMap !== 'object') {
                return;
            }

            if (typeof $dataMap._translateOriginalDisplayName !== 'string') {
                $dataMap._translateOriginalDisplayName =
                    typeof $dataMap.displayName === 'string' ? $dataMap.displayName : '';
            }

            const originalDisplayName = $dataMap._translateOriginalDisplayName;
            if (typeof originalDisplayName !== 'string' || originalDisplayName.trim() === '') {
                return;
            }

            const cacheKey = self.getCacheKey(originalDisplayName, 'map_name');
            if (self.hasUsableCacheValue(cacheKey)) {
                $dataMap.displayName = self.translationCache.get(cacheKey);
                return;
            }

            self.trackCacheKeyUsage(cacheKey);
            $dataMap.displayName = originalDisplayName;
        };

        const resolveCommandNameFromCache = (name, symbol) => {
            if (!name || typeof name !== 'string' || name.trim() === '' || symbol === 'choice') {
                return name;
            }

            const canonicalName =
                typeof self.getCanonicalSystemCommandName === 'function'
                    ? self.getCanonicalSystemCommandName(name)
                    : name;
            const commandKey = self.getCacheKey(canonicalName, 'command');

            if (self.hasUsableCacheValue(commandKey)) {
                self.trackCacheKeyUsage(commandKey, { harvestMissing: false });
                return self.translationCache.get(commandKey);
            }

            self.trackCacheKeyUsage(commandKey);

            return name;
        };

        const getSafeCurrentMessageText = () => {
            if (!window.$gameMessage) {
                return '';
            }

            if (typeof $gameMessage._translateOriginalText === 'string') {
                return $gameMessage._translateOriginalText;
            }

            if (typeof $gameMessage.allText === 'function') {
                try {
                    const text = $gameMessage.allText();
                    return typeof text === 'string' ? text : text ? String(text) : '';
                } catch (error) {
                    if (!self._loggedAllTextFallbackError) {
                        console.warn(
                            '[TranslateOnTheFly] Game_Message.allText failed, using _texts fallback',
                            error
                        );
                        self._loggedAllTextFallbackError = true;
                    }
                }
            }

            const texts = Array.isArray($gameMessage._texts) ? $gameMessage._texts : [];
            return texts.join('\n');
        };

        const resolveMessageTextCacheState = (originalText, hasPortrait) => {
            if (!originalText || !originalText.trim()) {
                return {
                    activeKey: null,
                    lookupKeys: [],
                    ready: true,
                    translated: null,
                    resolvedKey: null,
                };
            }

            const normalizedSourceText = PLUGIN_TRANSLATOR_REGISTRY.resolveMessageCacheSourceText({
                runtime: self,
                text: originalText,
                hasPortrait: !!hasPortrait,
                gameMessage: $gameMessage || null,
            });

            const keySourceText =
                typeof normalizedSourceText === 'string' && normalizedSourceText.length > 0
                    ? normalizedSourceText
                    : originalText;

            const activeKey = self.getMessageCacheKey(keySourceText, {
                hasPortrait: !!hasPortrait,
            });

            const lookupKeys = self.getMessageCacheLookupKeys(keySourceText, {
                hasPortrait: !!hasPortrait,
            });

            if (keySourceText !== originalText) {
                lookupKeys.push(
                    ...self.getMessageCacheLookupKeys(originalText, {
                        hasPortrait: !!hasPortrait,
                    })
                );
            }

            const dedupedLookupKeys = Array.from(new Set(lookupKeys));

            for (const key of dedupedLookupKeys) {
                if (!self.hasUsableCacheValue(key)) {
                    continue;
                }

                return {
                    activeKey,
                    lookupKeys: dedupedLookupKeys,
                    ready: true,
                    translated: self.translationCache.get(key),
                    resolvedKey: key,
                };
            }

            return {
                activeKey,
                lookupKeys: dedupedLookupKeys,
                ready: false,
                translated: null,
                resolvedKey: null,
            };
        };

        const imported = typeof Imported === 'object' && Imported ? Imported : {};
        const hasStrictMessageCore = !!(
            imported.VisuMZ_1_MessageCore ||
            imported.YEP_MessageCore ||
            imported.ExternalMessage
        );
        const shouldHookInterpreterCommands = !hasStrictMessageCore;

        const applyCachedActorNameFromCommand320 = (params) => {
            if (!Array.isArray(params) || !window.$gameActors) {
                return;
            }

            const actorId = Number(params[0]);
            const originalName = typeof params[1] === 'string' ? params[1].trim() : '';
            if (!Number.isFinite(actorId) || actorId <= 0 || !originalName) {
                return;
            }

            const actor =
                typeof $gameActors.actor === 'function' ? $gameActors.actor(actorId) : null;
            if (!actor) {
                return;
            }

            const speakerKey = self.getCacheKey(originalName, 'speaker');

            // Ensure the key exists so Names Manager can list it as cache-only actor_name.
            if (
                self.translationCache instanceof Map &&
                !self.translationCache.has(speakerKey) &&
                typeof self.setCacheValue === 'function'
            ) {
                self.setCacheValue(speakerKey, '');
            }

            if (typeof self.trackCacheKeyUsage === 'function') {
                self.trackCacheKeyUsage(speakerKey);
            }

            if (!self.hasUsableCacheValue(speakerKey)) {
                return;
            }

            const translated = self.translationCache.get(speakerKey);
            if (typeof translated !== 'string' || !translated.trim()) {
                return;
            }

            actor.setName(self.normalizeSpeakerNameCase(translated.trim()));
        };

        // Store original canStart if not already stored
        if (!Window_Message.prototype._originalCanStart) {
            Window_Message.prototype._originalCanStart = Window_Message.prototype.canStart;
        }

        if (!Game_Message.prototype._translateOriginalClear) {
            Game_Message.prototype._translateOriginalClear = Game_Message.prototype.clear;
        }

        Game_Message.prototype.clear = function () {
            Game_Message.prototype._translateOriginalClear.call(this);
            delete this._translateMessageOrigin;
        };

        if (!Game_Variables.prototype._translateOriginalValue) {
            Game_Variables.prototype._translateOriginalValue = Game_Variables.prototype.value;
        }

        Game_Variables.prototype.value = function (variableId) {
            const originalValue = Game_Variables.prototype._translateOriginalValue.call(
                this,
                variableId
            );
            const safeVariableId = Number(variableId) || 0;

            if (
                safeVariableId <= 0 ||
                !shouldReturnTranslatedVariableValue() ||
                !self.isVariableSafeForTranslation(safeVariableId) ||
                typeof originalValue !== 'string' ||
                originalValue.trim() === ''
            ) {
                return originalValue;
            }

            const cacheKey = self.getCacheKey(originalValue, 'variable_value');
            if (self.hasUsableCacheValue(cacheKey)) {
                if (typeof self.trackCacheKeyUsage === 'function') {
                    self.trackCacheKeyUsage(cacheKey, { harvestMissing: false });
                }

                console.log('Original vs cached variable value for ID', variableId, {
                    originalValue,
                    cachedValue: self.translationCache.get(cacheKey),
                });
                return self.translationCache.get(cacheKey);
            }

            if (typeof self.trackCacheKeyUsage === 'function') {
                self.trackCacheKeyUsage(cacheKey);
            }

            return originalValue;
        };

        if (shouldHookInterpreterCommands) {
            if (!Game_Interpreter.prototype._translateOriginalCommand101) {
                Game_Interpreter.prototype._translateOriginalCommand101 =
                    Game_Interpreter.prototype.command101;
            }

            Game_Interpreter.prototype.command101 = function (...args) {
                if (window.$gameMessage && !$gameMessage.isBusy()) {
                    markCurrentMessageAsEventOrigin('command101', this);
                }

                return Game_Interpreter.prototype._translateOriginalCommand101.apply(this, args);
            };

            if (!Game_Interpreter.prototype._translateOriginalCommand102) {
                Game_Interpreter.prototype._translateOriginalCommand102 =
                    Game_Interpreter.prototype.command102;
            }

            Game_Interpreter.prototype.command102 = function (...args) {
                if (window.$gameMessage && !$gameMessage.isBusy()) {
                    markCurrentMessageAsEventOrigin('command102', this);
                }

                return Game_Interpreter.prototype._translateOriginalCommand102.apply(this, args);
            };

            if (!Game_Interpreter.prototype._translateOriginalCommand320) {
                Game_Interpreter.prototype._translateOriginalCommand320 =
                    Game_Interpreter.prototype.command320;
            }

            Game_Interpreter.prototype.command320 = function (...args) {
                const result = Game_Interpreter.prototype._translateOriginalCommand320.apply(
                    this,
                    args
                );

                // MZ command signature is command320(params).
                // Prefer explicit args[0], then fall back to current command parameters.
                const params = Array.isArray(args[0])
                    ? args[0]
                    : this.currentCommand && this.currentCommand()
                      ? this.currentCommand().parameters
                      : null;
                applyCachedActorNameFromCommand320(params);
                return result;
            };
        }

        // Override canStart to block until translation is ready
        Window_Message.prototype.canStart = function () {
            // Store reference to this message window and $gameMessage for Alt+R refresh
            self.currentMessageWindow = this;
            self.currentGameMessage = $gameMessage;

            const originalCanStart = Window_Message.prototype._originalCanStart.call(this);
            const translationEnabled = self.isTranslationEnabled();
            const skipping = self.isSkippingMessages();
            const allowTranslation = translationEnabled && !skipping;
            const useCacheOnly =
                (translationEnabled && skipping) ||
                (!translationEnabled && self.translateCacheWhenDisabled);

            if (translationEnabled && allowTranslation && !$gameMessage._translateOriginalText) {
                // Lightweight trace to confirm hook runs after restart
                // console.log('[TranslateOnTheFly] canStart hook engaged, allowTranslation');
            }

            if (!originalCanStart || (!translationEnabled && !useCacheOnly)) {
                return originalCanStart;
            }

            // Skip system-composed battle messages (already localized via SystemMessages strategy)
            // so they are not re-translated, marked as seen, or cached as concrete variants.
            if (isBattleSystemMessage()) {
                return originalCanStart;
            }

            const originalText = getSafeCurrentMessageText();
            const hasText = !!(originalText && originalText.trim().length > 0);

            // Remember original text (even empty) for later key lookups (startInput)
            if ($gameMessage._translateOriginalText === undefined) {
                $gameMessage._translateOriginalText = originalText || '';
            }

            const messageHasPortrait = self.hasCurrentMessagePortrait($gameMessage);
            const textCacheState = hasText
                ? resolveMessageTextCacheState(originalText, messageHasPortrait)
                : {
                      activeKey: null,
                      lookupKeys: [],
                      ready: true,
                      translated: null,
                      resolvedKey: null,
                  };
            const cacheKey = textCacheState.activeKey;
            const choices = ($gameMessage.choices && $gameMessage.choices()) || [];
            // Freeze source choices once so translated replacements never become cache keys.
            if (
                !Array.isArray($gameMessage._translateOriginalChoices) &&
                Array.isArray(choices) &&
                choices.length > 0
            ) {
                $gameMessage._translateOriginalChoices = choices.slice();
            }
            const originalChoices =
                $gameMessage._translateOriginalChoices || (Array.isArray(choices) ? choices : []);
            const hasChoices = Array.isArray(originalChoices) && originalChoices.length > 0;
            const choiceCacheKeys = hasChoices
                ? originalChoices.map((choice) => self.getCacheKey(choice, 'choice'))
                : [];

            const originalSpeakerName =
                $gameMessage._translateOriginalSpeaker || $gameMessage._speakerName || '';
            const hasSpeakerName = !!(originalSpeakerName && originalSpeakerName.trim().length > 0);
            const speakerKey = hasSpeakerName
                ? self.getCacheKey(originalSpeakerName, 'speaker')
                : null;
            const legacySpeakerKey = hasSpeakerName
                ? `speaker:${self.sourceLang}-${self.targetLang}-${originalSpeakerName.replace(/\n+$/, '')}`
                : null;
            if (hasSpeakerName) {
                $gameMessage._translateOriginalSpeaker = originalSpeakerName;
            }

            if (hasText) {
                const seenTextKey = textCacheState.resolvedKey || cacheKey;
                // On cache hit, track the exact key that resolved the translation so Seen
                // reflects the real source key (e.g. message_portrait fallback).
                self.trackCacheKeyUsage(seenTextKey, {
                    harvestMissing: !textCacheState.resolvedKey,
                });
            }
            if (hasChoices) {
                for (const choice of originalChoices) {
                    self.trackCacheKeyUsage(self.getCacheKey(choice, 'choice'));
                }
            }

            const textReady = !hasText || textCacheState.ready;
            const choicesReady =
                !hasChoices || choiceCacheKeys.every((key) => self.hasUsableCacheValue(key));
            const speakerReady = !hasSpeakerName || self.hasUsableCacheValue(speakerKey);

            if (useCacheOnly) {
                if (!this._translationApplied && hasText && textReady) {
                    const translatedText = textCacheState.translated;
                    if (translatedText !== undefined) {
                        self.replaceMessageText(translatedText);
                        this._translationApplied = true;
                    }
                }

                if (hasChoices && choicesReady) {
                    const translatedChoices = originalChoices.map((choice, idx) => {
                        const key = choiceCacheKeys[idx];
                        return self.translationCache.get(key) || choice;
                    });
                    self.replaceChoiceText(translatedChoices);
                }

                if (hasSpeakerName && speakerReady) {
                    const cachedSpeaker = self.translationCache.get(speakerKey);
                    self.replaceSpeakerName(cachedSpeaker);
                }

                return originalCanStart;
            }

            // Check if this message was already translated
            if (!this._translationApplied) {
                // If we have cached translation, apply it now (text + choices + speaker)
                if (allowTranslation && textReady && choicesReady && speakerReady) {
                    if (hasText) {
                        const translatedText = textCacheState.translated;
                        if (translatedText !== undefined && translatedText !== null) {
                            self.replaceMessageText(translatedText);
                        }
                    }

                    if (hasChoices) {
                        const translatedChoices = originalChoices.map((choice, idx) => {
                            const key = choiceCacheKeys[idx];
                            return self.translationCache.get(key) || choice;
                        });
                        self.replaceChoiceText(translatedChoices);
                    }

                    if (hasSpeakerName && speakerReady) {
                        const cachedSpeaker =
                            self.translationCache.get(speakerKey) ||
                            self.translationCache.get(legacySpeakerKey);
                        self.replaceSpeakerName(cachedSpeaker);
                    }

                    this._translationApplied = true;
                    console.log('[TranslateOnTheFly] Applied cached translation');
                    return originalCanStart;
                }

                // If translation is pending, keep blocking
                if (
                    allowTranslation &&
                    (self.isForegroundDialogBatchActive() ||
                        (cacheKey && self.pendingTranslations.has(cacheKey)) ||
                        (hasChoices &&
                            choiceCacheKeys.some((key) => self.pendingTranslations.has(key))))
                ) {
                    return false;
                }

                // If main text translation failed and is in cooldown, don't retry yet (show original)
                if (allowTranslation && cacheKey && self.failedTranslations.has(cacheKey)) {
                    const failedTime = self.failedTranslations.get(cacheKey);
                    const cooldownMs = 5000; // Wait 5 seconds before retrying failed translation
                    if (Date.now() - failedTime < cooldownMs) {
                        // Show original, don't try to translate again
                        if (!this._translationApplied) {
                            this._translationApplied = true;
                        }
                        return originalCanStart;
                    } else {
                        // Cooldown expired, remove from failed and allow retry
                        self.failedTranslations.delete(cacheKey);
                    }
                }

                // Start translation with unified batch approach (maxDepth=0 for single, >0 for lookahead)
                if (allowTranslation && hasText && !textReady) {
                    const maxDepth = self.tryTranslateAhead ? 999 : 0; // 0 = only current message, 999 = scan ahead
                    const logPrefix = maxDepth > 0 ? 'ahead translation batch' : 'translation';
                    console.log(
                        `[TranslateOnTheFly] Starting 01 ${logPrefix} for:`,
                        originalText.substring(0, 50)
                    );

                    self.requestForegroundDialogBatch({
                        currentText: originalText,
                        currentSpeakerName: originalSpeakerName,
                        cacheKey,
                        hasPortrait: messageHasPortrait,
                        maxDepth,
                        sourceTrigger: 'Starting 01',
                    });
                }

                // Choices: respect cooldown on failures to avoid loops
                if (
                    allowTranslation &&
                    hasChoices &&
                    !choicesReady &&
                    choiceCacheKeys.some((key) => self.failedTranslations.has(key))
                ) {
                    const failedTime = Math.max(
                        ...choiceCacheKeys.map((key) => self.failedTranslations.get(key) || 0)
                    );
                    const cooldownMs = 5000;
                    if (Date.now() - failedTime < cooldownMs) {
                        // Use original choices during cooldown and skip retry
                        self.replaceChoiceText(originalChoices);
                        // Still apply cached text/speaker if available so dialog is translated
                        if (!this._translationApplied) {
                            if (hasText && textReady) {
                                const translatedText = textCacheState.translated;
                                if (translatedText !== undefined && translatedText !== null) {
                                    self.replaceMessageText(translatedText);
                                }
                            }
                            if (hasSpeakerName && speakerReady) {
                                const cachedSpeaker =
                                    self.translationCache.get(speakerKey) ||
                                    self.translationCache.get(legacySpeakerKey);
                                if (cachedSpeaker) {
                                    self.replaceSpeakerName(cachedSpeaker);
                                }
                            }
                            this._translationApplied = true;
                        }
                        return originalCanStart;
                    } else {
                        for (const key of choiceCacheKeys) {
                            self.failedTranslations.delete(key);
                        }
                        // fall through to start translation below
                    }
                }

                // If no text or text already cached, but choices are missing, trigger batch translation as well
                if (
                    allowTranslation &&
                    hasChoices &&
                    !choicesReady &&
                    !choiceCacheKeys.some((key) => self.pendingTranslations.has(key))
                ) {
                    const maxDepth = self.tryTranslateAhead ? 999 : 0;
                    const logPrefix =
                        maxDepth > 0
                            ? 'ahead translation batch for choices'
                            : 'translation for choices';
                    console.log(`[TranslateOnTheFly] Starting 02 ${logPrefix}`);

                    self.requestForegroundDialogBatch({
                        currentText: originalText || '',
                        currentSpeakerName: originalSpeakerName,
                        cacheKey:
                            cacheKey ||
                            self.getMessageCacheKey(originalText || '', {
                                hasPortrait: messageHasPortrait,
                            }),
                        hasPortrait: messageHasPortrait,
                        maxDepth,
                        sourceTrigger: 'Starting 02',
                    });
                }

                // Choices are now translated together with text in startAheadTranslation batch
                // Just apply them if cached
                if (choicesReady) {
                    const cachedChoices = originalChoices.map((choice, idx) => {
                        const key = choiceCacheKeys[idx];
                        return self.translationCache.get(key) || choice;
                    });
                    self.replaceChoiceText(cachedChoices);
                }

                // Speaker: respect cooldown on failures to avoid loops
                if (
                    allowTranslation &&
                    hasSpeakerName &&
                    !speakerReady &&
                    self.failedTranslations.has(speakerKey)
                ) {
                    const failedTime = self.failedTranslations.get(speakerKey);
                    const cooldownMs = 5000;
                    if (Date.now() - failedTime < cooldownMs) {
                        // Keep original speaker during cooldown
                        self.replaceSpeakerName(originalSpeakerName);
                        // Do not start translation now
                        return false; // still block start until text is handled above
                    } else {
                        self.failedTranslations.delete(speakerKey);
                    }
                }

                // Start translation for speaker via unified foreground batch path.
                if (allowTranslation && hasSpeakerName && !speakerReady) {
                    const maxDepth = self.tryTranslateAhead ? 999 : 0;
                    self.requestForegroundDialogBatch({
                        currentText: originalText || '',
                        currentSpeakerName: originalSpeakerName,
                        cacheKey:
                            cacheKey ||
                            self.getMessageCacheKey(originalText || '', {
                                hasPortrait: messageHasPortrait,
                            }),
                        hasPortrait: messageHasPortrait,
                        maxDepth,
                        sourceTrigger: 'speaker',
                    });
                }

                // Block start until all translations are done
                if (allowTranslation && !speakerReady && hasSpeakerName) {
                    return false;
                }

                if (allowTranslation) {
                    return false;
                }
            }

            // Translation already applied, allow start
            return originalCanStart;
        };

        // Reset translation flag when message terminates
        if (!Window_Message.prototype._originalTerminateMessage) {
            Window_Message.prototype._originalTerminateMessage =
                Window_Message.prototype.terminateMessage;
        }

        Window_Message.prototype.terminateMessage = function () {
            this._translationApplied = false;
            if ($gameMessage) {
                // Clear stored original choices to avoid stale keys
                delete $gameMessage._translateOriginalChoices;
                delete $gameMessage._translateOriginalText;
                delete $gameMessage._translateOriginalSpeaker;
                clearCurrentMessageOrigin();
            }
            Window_Message.prototype._originalTerminateMessage.call(this);
        };

        // Hook Game_Message.setChoices to translate choices as soon as they are set
        if (!Game_Message.prototype._originalSetChoices) {
            Game_Message.prototype._originalSetChoices = Game_Message.prototype.setChoices;
        }

        Game_Message.prototype.setChoices = function (choices, defaultType, cancelType) {
            Game_Message.prototype._originalSetChoices.call(this, choices, defaultType, cancelType);

            // Store original choices for stable cache keys (they may be mutated later).
            // If a plugin translator already preserved the original source values,
            // use that snapshot instead of the potentially translated array.
            if (Array.isArray(choices) && Array.isArray(choices._translateOriginalChoices)) {
                this._translateOriginalChoices = choices._translateOriginalChoices.slice();
            } else {
                this._translateOriginalChoices = (choices || []).slice();
            }

            const translationEnabled = self.isTranslationEnabled();
            const skipping = self.isSkippingMessages();
            const allowTranslation = translationEnabled && !skipping;
            const useCacheOnly =
                (translationEnabled && skipping) ||
                (!translationEnabled && self.translateCacheWhenDisabled);

            if (!allowTranslation && !useCacheOnly) {
                return;
            }

            if (isBattleSystemMessage()) {
                return;
            }

            for (const choice of this._translateOriginalChoices) {
                self.trackCacheKeyUsage(self.getCacheKey(choice, 'choice'));
            }

            const choiceKeys = this._translateOriginalChoices.map((choice) =>
                self.getCacheKey(choice, 'choice')
            );

            // If all choices already cached, replace immediately
            if (choiceKeys.length > 0 && choiceKeys.every((key) => self.hasUsableCacheValue(key))) {
                const translated = this._translateOriginalChoices.map((choice, idx) => {
                    const key = choiceKeys[idx];
                    return self.translationCache.get(key) || choice;
                });
                self.replaceChoiceText(translated);
                return;
            }

            if (!allowTranslation || skipping) {
                return;
            }

            const pendingChoiceItems = [];
            for (let i = 0; i < this._translateOriginalChoices.length; i++) {
                const choice = this._translateOriginalChoices[i];
                const cacheKey = choiceKeys[i];
                if (!choice || typeof choice !== 'string' || choice.trim() === '') {
                    continue;
                }
                if (!cacheKey || self.hasUsableCacheValue(cacheKey)) {
                    continue;
                }
                if (self.pendingTranslations.has(cacheKey)) {
                    continue;
                }

                pendingChoiceItems.push({
                    type: 'choice',
                    id: `choice_rt_${i}`,
                    value: choice,
                    cacheKey,
                });
            }

            if (pendingChoiceItems.length === 0) {
                return;
            }

            if (!self.batchManager) {
                self.batchManager = createTranslationBatchManager(self);
            }

            self.batchManager
                .runBatchedTranslation(
                    [
                        {
                            kind: 'directItems',
                            items: pendingChoiceItems,
                            translationPhaseLabel: 'OTF - translating choices',
                            backgroundJob: false,
                            itemLimit: self.batchItemsLimit || 20,
                            charLimit: self.charLimit || 1000,
                            showSummary: false,
                        },
                    ],
                    {
                        translationPhaseLabel: 'OTF - translating choices',
                        backgroundJob: false,
                        showSummary: false,
                    }
                )
                .then(() => {
                    const refreshedChoices = this._translateOriginalChoices.map(
                        (entryChoice, idx) => {
                            const key = choiceKeys[idx];
                            return self.translationCache.get(key) || entryChoice;
                        }
                    );
                    self.replaceChoiceText(refreshedChoices);
                })
                .catch((error) => {
                    console.warn(
                        '[TranslateOnTheFly] Failed to translate choices in setChoices',
                        error
                    );
                });
        };

        // Block entering choice input until choices are translated
        if (!Window_Message.prototype._originalStartInput) {
            Window_Message.prototype._originalStartInput = Window_Message.prototype.startInput;
        }

        Window_Message.prototype.startInput = function () {
            const translationEnabled = self.isTranslationEnabled();
            const skipping = self.isSkippingMessages();
            const allowTranslation = translationEnabled && !skipping;
            const useCacheOnly =
                (translationEnabled && skipping) ||
                (!translationEnabled && self.translateCacheWhenDisabled);

            const originalText = getSafeCurrentMessageText();
            const hasText = !!(originalText && originalText.trim().length > 0);
            const messageHasPortrait = self.hasCurrentMessagePortrait($gameMessage);
            const textCacheState = hasText
                ? resolveMessageTextCacheState(originalText, messageHasPortrait)
                : {
                      activeKey: null,
                      lookupKeys: [],
                      ready: true,
                      translated: null,
                      resolvedKey: null,
                  };
            const textKey = textCacheState.activeKey;
            const originalSpeakerName =
                $gameMessage._translateOriginalSpeaker || $gameMessage._speakerName || '';

            if (allowTranslation) {
                if (self.isForegroundDialogBatchActive()) {
                    return false;
                }

                // Block input if main text translation is still pending or missing
                if (hasText && textKey) {
                    if (self.pendingTranslations.has(textKey)) {
                        return false; // wait for text translation
                    }

                    // If translation already applied on this window, allow
                    if (!this._translationApplied && !textCacheState.ready) {
                        return false; // text not translated/applied yet
                    }
                }
            }

            if ((translationEnabled || useCacheOnly) && $gameMessage.isChoice()) {
                const choices = $gameMessage.choices();
                // Keep a stable source snapshot to avoid using translated choices as keys.
                if (
                    !Array.isArray($gameMessage._translateOriginalChoices) &&
                    Array.isArray(choices) &&
                    choices.length > 0
                ) {
                    $gameMessage._translateOriginalChoices = choices.slice();
                }
                const originalChoices =
                    $gameMessage._translateOriginalChoices ||
                    (Array.isArray(choices) ? choices : []);
                const choiceKeys = originalChoices.map((choice) =>
                    self.getCacheKey(choice, 'choice')
                );

                if (useCacheOnly) {
                    const translatedChoices = originalChoices.map((choice, idx) => {
                        const key = choiceKeys[idx];
                        return self.translationCache.get(key) || choice;
                    });
                    self.replaceChoiceText(translatedChoices);
                    return Window_Message.prototype._originalStartInput.call(this);
                }

                // If choices translation is pending, wait
                if (
                    allowTranslation &&
                    choiceKeys.some((key) => self.pendingTranslations.has(key))
                ) {
                    return false; // keep waiting
                }

                // If previous choice translation failed and in cooldown, proceed with originals
                if (
                    allowTranslation &&
                    choiceKeys.some((key) => self.failedTranslations.has(key))
                ) {
                    const failedTime = Math.max(
                        ...choiceKeys.map((key) => self.failedTranslations.get(key) || 0)
                    );
                    const cooldownMs = 5000;
                    if (Date.now() - failedTime < cooldownMs) {
                        self.replaceChoiceText(originalChoices);
                        return Window_Message.prototype._originalStartInput.call(this);
                    }
                    // cooldown expired -> retry below and clear flag
                    for (const key of choiceKeys) {
                        self.failedTranslations.delete(key);
                    }
                }

                // Choices should already be translated from main batch
                // If not cached by now, something went wrong - use originals
                const choicesReady =
                    choiceKeys.length === 0 ||
                    choiceKeys.every((key) => self.hasUsableCacheValue(key));
                if (!choicesReady && allowTranslation) {
                    console.warn(
                        '[TranslateOnTheFly] Choices not in cache (should have been translated with text)'
                    );
                    self.replaceChoiceText(originalChoices);

                    // Kick off a batch translate for the event (unless already pending) and block until ready
                    if (!choiceKeys.some((key) => self.pendingTranslations.has(key))) {
                        const maxDepth = self.tryTranslateAhead ? 999 : 0;
                        const logPrefix =
                            maxDepth > 0
                                ? 'ahead translation batch for choices (startInput fallback)'
                                : 'translation for choices (startInput fallback)';
                        console.log(`[TranslateOnTheFly] Starting 03 ${logPrefix}`);

                        self.requestForegroundDialogBatch({
                            currentText: originalText || '',
                            currentSpeakerName: originalSpeakerName,
                            cacheKey:
                                textKey ||
                                self.getMessageCacheKey(originalText || '', {
                                    hasPortrait: messageHasPortrait,
                                }),
                            hasPortrait: messageHasPortrait,
                            maxDepth,
                            sourceTrigger: 'Starting 03',
                        });
                    }

                    return false; // wait for batch to complete
                }

                // Cached -> ensure applied then proceed
                if (choicesReady) {
                    const cachedChoices = originalChoices.map((choice, idx) => {
                        const key = choiceKeys[idx];
                        return self.translationCache.get(key) || choice;
                    });
                    self.replaceChoiceText(cachedChoices);
                }
            }

            return Window_Message.prototype._originalStartInput.call(this);
        };

        if (!DataManager._extractSaveContents) {
            DataManager._extractSaveContents = DataManager.extractSaveContents;
        }

        DataManager.extractSaveContents = function (contents) {
            DataManager._extractSaveContents(contents);
            console.log(
                '[TranslateOnTheFly] Extracted save contents, applying cached translations if any'
            );

            applyLifecycleTranslations('extractSaveContents');
            console.log(
                '[TranslateOnTheFly] Applied cached translations to $dataActors, $dataClasses, $dataEnemies and their game objects'
            );
        };

        if (!DataManager._createGameObjects) {
            DataManager._createGameObjects = DataManager.createGameObjects;
        }

        DataManager.createGameObjects = function () {
            DataManager._createGameObjects();
            console.log(
                '[TranslateOnTheFly] Created game objects, applying cached translations if any'
            );
            applyLifecycleTranslations('createGameObjects');
            console.log('[TranslateOnTheFly] Applied cached translations to data containers');
        };

        if (!DataManager._loadDatabase) {
            DataManager._loadDatabase = DataManager.loadDatabase;
        }

        DataManager.loadDatabase = function () {
            DataManager._loadDatabase();
            console.log(
                '[TranslateOnTheFly] Loaded database, applying cached system message translations if any'
            );
            applyLifecycleTranslations('loadDatabase');
            console.log('[TranslateOnTheFly] Applied cached translations to system messages');
        };

        if (typeof Scene_Title !== 'undefined') {
            if (!Scene_Title.prototype._translateOriginalCreateCommandWindow) {
                Scene_Title.prototype._translateOriginalCreateCommandWindow =
                    Scene_Title.prototype.createCommandWindow;
            }

            Scene_Title.prototype.createCommandWindow = function () {
                applyLifecycleTranslations('sceneTitleCreateCommandWindow');
                return Scene_Title.prototype._translateOriginalCreateCommandWindow.call(this);
            };
        }

        if (typeof Scene_Load !== 'undefined') {
            if (!Scene_Load.prototype._translateOriginalHelpWindowText) {
                Scene_Load.prototype._translateOriginalHelpWindowText =
                    Scene_Load.prototype.helpWindowText;
            }

            Scene_Load.prototype.helpWindowText = function () {
                applyLifecycleTranslations('sceneLoadHelpWindowText');
                return Scene_Load.prototype._translateOriginalHelpWindowText.call(this);
            };
        }

        if (typeof Scene_Map !== 'undefined') {
            if (!Scene_Map.prototype._translateOriginalOnMapLoaded) {
                Scene_Map.prototype._translateOriginalOnMapLoaded = Scene_Map.prototype.onMapLoaded;
            }

            Scene_Map.prototype.onMapLoaded = function () {
                applyLifecycleTranslations('sceneMapOnMapLoaded');
                applyCurrentMapDisplayNameFromCache();
                return Scene_Map.prototype._translateOriginalOnMapLoaded.call(this);
            };
        }

        // Hook Window_Command.prototype.refresh to translate commands before rendering
        if (!Window_Command.prototype._originalRefresh) {
            Window_Command.prototype._originalRefresh = Window_Command.prototype.refresh;
        }

        Window_Command.prototype.refresh = async function () {
            const translationEnabled = self.isTranslationEnabled();
            const useCacheOnly = !translationEnabled && self.translateCacheWhenDisabled;

            // In cache-only mode keep the engine's original synchronous refresh flow.
            // MZ title/menu windows are initialized during scene creation and expect
            // refresh to complete synchronously.
            if (useCacheOnly) {
                this._translateApplyingCommandCache = true;
                try {
                    return Window_Command.prototype._originalRefresh.call(this);
                } finally {
                    this._translateApplyingCommandCache = false;
                }
            }

            // If translation is completely disabled, use original
            if (!translationEnabled && !useCacheOnly) {
                return Window_Command.prototype._originalRefresh.call(this);
            }

            // Mark that we're in refresh - addCommand will collect names
            this._collectingCommands = true;
            this._collectedCommands = [];

            console.log(
                '[TranslateOnTheFly] Refreshing command window, collecting commands for translation',
                $dataSystem
            );
            // First time only: collect system command terms for translation
            if (
                !self._systemCommandsCollected &&
                $dataSystem &&
                $dataSystem.terms &&
                $dataSystem.terms.commands
            ) {
                const systemCommands = $dataSystem.terms.commands.filter((cmd) => !!cmd);
                for (const cmdName of systemCommands) {
                    this._collectedCommands.push({
                        name: cmdName,
                        symbol: 'dummy',
                        enabled: true,
                        ext: null,
                        isAdditional: true,
                    });
                }
                self._systemCommandsCollected = true;
                console.log(
                    `[TranslateOnTheFly] Collected ${systemCommands.length} system commands for translation`
                );
            }

            // Call original makeCommandList to collect all command names
            this.clearCommandList();
            this.makeCommandList();

            // Restore normal mode
            this._collectingCommands = false;

            const commandsToTranslate = this._collectedCommands
                .map((cmd) => {
                    if (!cmd || cmd.symbol === 'choice') {
                        return null;
                    }

                    if (!cmd.name || typeof cmd.name !== 'string' || cmd.name.trim() === '') {
                        return null;
                    }

                    const canonicalName =
                        typeof self.getCanonicalSystemCommandName === 'function'
                            ? self.getCanonicalSystemCommandName(cmd.name)
                            : cmd.name;
                    const cacheKey = self.getCacheKey(canonicalName, 'command');

                    return {
                        ...cmd,
                        sourceName: canonicalName,
                        cacheKey,
                    };
                })
                .filter((cmd) => {
                    if (!cmd) {
                        return false;
                    }

                    if (self.hasUsableCacheValue(cmd.cacheKey)) {
                        self.trackCacheKeyUsage(cmd.cacheKey, { harvestMissing: false });
                        return false;
                    }

                    return true;
                });

            if (commandsToTranslate.length > 0) {
                const items = commandsToTranslate.map((cmd, i) => ({
                    type: 'command',
                    id: `cmd_${i}`,
                    value: cmd.sourceName,
                    cacheKey: cmd.cacheKey,
                }));

                const harvestOnly =
                    useCacheOnly ||
                    (typeof self.isNonOtfTranslationProcessActive === 'function' &&
                        self.isNonOtfTranslationProcessActive());

                // Cache-only mode means harvesting keys only. Do not translate on the fly.
                if (harvestOnly) {
                    for (const item of items) {
                        self.setCacheValue(item.cacheKey, '');
                    }
                    console.log(
                        `[TranslateOnTheFly] Harvested ${items.length} menu options to cache without translation`
                    );
                } else if (translationEnabled) {
                    console.log(
                        `[TranslateOnTheFly] Batch translating ${commandsToTranslate.length} commands`
                    );

                    try {
                        if (!self.batchManager) {
                            self.batchManager = createTranslationBatchManager(self);
                        }

                        const result = await self.batchManager.runBatchedTranslation([
                            {
                                kind: 'directItems',
                                items,
                                translationPhaseLabel: 'translating menu options',
                                backgroundJob: false,
                                itemLimit: self.batchItemsLimit || 20,
                                charLimit: self.charLimit || 1000,
                                showSummary: false,
                            },
                        ]);

                        // Cache successes
                        for (const success of result.successes) {
                            self.setCacheValue(success.cacheKey, success.translated);
                            console.log(
                                `[TranslateOnTheFly] Cached command: "${items.find((i) => i.cacheKey === success.cacheKey).value}" → "${success.translated}"`
                            );
                        }

                        // Cache failures as empty strings (for harvesting untranslated strings)
                        for (const failure of result.failures) {
                            self.setCacheValue(failure.cacheKey, '');
                            console.warn(
                                `[TranslateOnTheFly] Failed to translate command (cached as empty):`,
                                failure.value,
                                '→',
                                failure.rejectReason
                            );
                        }

                        // Mark failures
                        self.markBatchFailuresAsUntranslated(result.failures, true);
                    } catch (error) {
                        console.error(
                            '[TranslateOnTheFly] Batch command translation error:',
                            error
                        );
                        self.markBatchItemsAsUntranslated(items, true);
                    }
                }
            }
            this._collectedCommands = this._collectedCommands.filter(
                (cmd) => cmd && !cmd.isAdditional
            );

            // Now add all commands with translations (from cache or original)
            this.clearCommandList();
            for (const cmd of this._collectedCommands) {
                let finalName = cmd.name;

                if (
                    cmd.symbol !== 'choice' &&
                    cmd.name &&
                    typeof cmd.name === 'string' &&
                    cmd.name.trim() !== ''
                ) {
                    const canonicalName =
                        typeof self.getCanonicalSystemCommandName === 'function'
                            ? self.getCanonicalSystemCommandName(cmd.name)
                            : cmd.name;
                    const commandKey = self.getCacheKey(canonicalName, 'command');
                    if (self.hasUsableCacheValue(commandKey)) {
                        self.trackCacheKeyUsage(commandKey, { harvestMissing: false });
                        finalName = self.translationCache.get(commandKey);
                    } else {
                        self.trackCacheKeyUsage(commandKey);
                    }
                }

                this._list.push({
                    name: finalName,
                    symbol: cmd.symbol,
                    enabled: cmd.enabled,
                    ext: cmd.ext,
                });
            }

            // Continue with original refresh logic (after makeCommandList)
            delete this._collectedCommands;
            this.createContents();
            Window_Selectable.prototype.refresh.call(this);
        };

        // Hook addCommand to collect command names during makeCommandList
        if (!Window_Command.prototype._originalAddCommand) {
            Window_Command.prototype._originalAddCommand = Window_Command.prototype.addCommand;
        }

        Window_Command.prototype.addCommand = function (name, symbol, enabled = true, ext = null) {
            if (this._collectingCommands) {
                console.log('[TranslateOnTheFly] Collected command for translation:', name, symbol);
                this._collectedCommands.push({ name, symbol, enabled, ext });
                return;
            }

            if (this._translateApplyingCommandCache) {
                name = resolveCommandNameFromCache(name, symbol);
            }

            // Normal mode - use original
            return Window_Command.prototype._originalAddCommand.call(
                this,
                name,
                symbol,
                enabled,
                ext
            );
        };
    },
};
