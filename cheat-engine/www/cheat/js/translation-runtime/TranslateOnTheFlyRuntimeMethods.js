import { createTranslationBatchManager } from '../../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import {
    installCommandTranslationHook,
    isTranslationActive,
} from '../CommandTranslationManager.js';
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

        const resolveScrollTextCacheKey = (originalText) => {
            if (typeof originalText !== 'string' || originalText.trim() === '') {
                return null;
            }

            return self.getCacheKey(originalText, 'scroll_text');
        };

        const applyScrollTextFromCache = (scrollWindow, originalText) => {
            const cacheKey = resolveScrollTextCacheKey(originalText);
            if (!cacheKey) {
                return false;
            }

            self.trackCacheKeyUsage(cacheKey);
            if (!self.hasUsableCacheValue(cacheKey)) {
                return false;
            }

            const translated = self.translationCache.get(cacheKey);
            if (typeof translated !== 'string') {
                return false;
            }

            scrollWindow._text = translated;
            if (typeof scrollWindow.refresh === 'function') {
                scrollWindow.refresh();
            }

            return true;
        };

        const imported = typeof Imported === 'object' && Imported ? Imported : {};
        const hasStrictMessageCore = !!(
            imported.VisuMZ_1_MessageCore ||
            imported.YEP_MessageCore ||
            imported.ExternalMessage
        );
        const shouldHookInterpreterCommands = !hasStrictMessageCore;

        const applyCachedActorNameFromCommand320 = (params) => {
            if (!isTranslationActive(self)) {
                return;
            }

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

        const shouldUseImageCacheTranslation = () => {
            return (
                !!self.translateImagesInCacheIfAny &&
                typeof self.targetLang === 'string' &&
                self.targetLang.trim() !== ''
            );
        };

        const resolveTranslatedImagePath = (folder, filename) => {
            if (!shouldUseImageCacheTranslation()) {
                return null;
            }

            const nodeRequire = globalThis?.require;
            if (typeof nodeRequire !== 'function') {
                return null;
            }

            const safeFolder = typeof folder === 'string' ? folder : '';
            const safeFilename = typeof filename === 'string' ? filename.trim() : '';
            if (!safeFolder || !safeFilename) {
                return null;
            }

            const fs = nodeRequire('fs');
            const path = nodeRequire('path');

            const normalizedFolder = safeFolder.replaceAll('\\', '/');
            if (!normalizedFolder.startsWith('img/')) {
                return null;
            }

            const relativeImageFolder = normalizedFolder.replace(/^img\//, '').replace(/\/$/, '');
            const normalizedFilename = safeFilename.replaceAll('\\', '/');
            const baseFileName = normalizedFilename.replace(/(\.png_|\.rpgmvp|\.png)$/i, '');

            if (
                relativeImageFolder.includes('..') ||
                normalizedFilename.startsWith('/') ||
                normalizedFilename.includes('..') ||
                !baseFileName ||
                baseFileName.endsWith('/')
            ) {
                return null;
            }

            const splitCacheDirectory = self.getSplitCacheDirectoryPath();
            if (!splitCacheDirectory || typeof splitCacheDirectory !== 'string') {
                return null;
            }

            const translatedImagePath = path.resolve(
                splitCacheDirectory,
                'img',
                self.targetLang,
                relativeImageFolder,
                `${baseFileName}.png`
            );

            return fs.existsSync(translatedImagePath) ? translatedImagePath : null;
        };

        const installImageManagerBitmapHook = () => {
            if (
                (typeof ImageManager !== 'object' && typeof ImageManager !== 'function') ||
                !ImageManager ||
                typeof ImageManager.loadBitmap !== 'function'
            ) {
                return false;
            }

            if (ImageManager._translateImageCacheHookInstalled) {
                return true;
            }

            if (!ImageManager._translateOriginalLoadBitmap) {
                ImageManager._translateOriginalLoadBitmap = ImageManager.loadBitmap;
            }

            ImageManager.loadBitmap = function (folder, filename, hue, smooth) {
                const translatedImagePath = resolveTranslatedImagePath(folder, filename);
                if (!translatedImagePath) {
                    return ImageManager._translateOriginalLoadBitmap.call(
                        this,
                        folder,
                        filename,
                        hue,
                        smooth
                    );
                }

                try {
                    const nodeRequire = globalThis?.require;
                    if (typeof nodeRequire !== 'function') {
                        return ImageManager._translateOriginalLoadBitmap.call(
                            this,
                            folder,
                            filename,
                            hue,
                            smooth
                        );
                    }

                    const path = nodeRequire('path');
                    const translatedFolder = `${path.dirname(translatedImagePath).replaceAll('\\', '/')}/`;
                    const translatedFilename = path.basename(
                        translatedImagePath,
                        path.extname(translatedImagePath)
                    );

                    let restoreMZEncryptedImages = null;
                    let restoreMVEncryptedImages = null;
                    const decrypter = globalThis?.Decrypter;

                    if (
                        (typeof Utils === 'object' || typeof Utils === 'function') &&
                        Utils &&
                        typeof Utils.hasEncryptedImages === 'function'
                    ) {
                        const wasEncrypted = !!Utils.hasEncryptedImages();
                        if (
                            wasEncrypted &&
                            Object.prototype.hasOwnProperty.call(Utils, '_hasEncryptedImages')
                        ) {
                            restoreMZEncryptedImages = Utils._hasEncryptedImages;
                            Utils._hasEncryptedImages = false;
                        }
                    }

                    if (
                        (typeof decrypter === 'object' || typeof decrypter === 'function') &&
                        decrypter &&
                        typeof decrypter.hasEncryptedImages === 'boolean' &&
                        decrypter.hasEncryptedImages
                    ) {
                        restoreMVEncryptedImages = decrypter.hasEncryptedImages;
                        decrypter.hasEncryptedImages = false;
                    }

                    try {
                        return ImageManager._translateOriginalLoadBitmap.call(
                            this,
                            translatedFolder,
                            translatedFilename,
                            hue,
                            smooth
                        );
                    } finally {
                        if (restoreMZEncryptedImages !== null) {
                            Utils._hasEncryptedImages = restoreMZEncryptedImages;
                        }
                        if (restoreMVEncryptedImages !== null) {
                            decrypter.hasEncryptedImages = restoreMVEncryptedImages;
                        }
                    }
                } catch (_error) {
                    console.warn(
                        '[TranslateOnTheFly] Failed to load translated image from cache',
                        _error
                    );
                    return ImageManager._translateOriginalLoadBitmap.call(
                        this,
                        folder,
                        filename,
                        hue,
                        smooth
                    );
                }
            };

            ImageManager._translateImageCacheHookInstalled = true;
            console.log('[TranslateOnTheFly] ImageManager image-cache hook installed');
            return true;
        };

        if (!installImageManagerBitmapHook()) {
            let imageManagerHookRetryCount = 0;
            const maxImageManagerHookRetries = 20;
            const imageManagerRetryTimer = setInterval(() => {
                imageManagerHookRetryCount += 1;
                if (installImageManagerBitmapHook()) {
                    clearInterval(imageManagerRetryTimer);
                    return;
                }

                if (imageManagerHookRetryCount >= maxImageManagerHookRetries) {
                    clearInterval(imageManagerRetryTimer);
                    console.warn(
                        '[TranslateOnTheFly] Failed to install ImageManager image-cache hook'
                    );
                }
            }, 500);
        }

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
                console.log('Intercepted command 320 with args', args);
                const result = Game_Interpreter.prototype._translateOriginalCommand320.apply(
                    this,
                    args
                );
                console.log('Result of original command 320', result);
                // MZ command signature is command320(params).
                // Prefer explicit args[0], then fall back to current command parameters.
                const params = Array.isArray(args[0])
                    ? args[0]
                    : this.currentCommand && this.currentCommand()
                      ? this.currentCommand().parameters
                      : null;
                console.log('Applying cached actor name from command 320 with params', params);
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

            const textReady = !hasText || textCacheState.ready;
            const choicesReady =
                !hasChoices || choiceCacheKeys.every((key) => self.hasUsableCacheValue(key));
            const speakerReady = !hasSpeakerName || self.hasUsableCacheValue(speakerKey);

            if (useCacheOnly) {
                // Cache-only mode should do at most one pass per message to avoid
                // repeated hot-path work when canStart is polled every frame.
                if (this._translationApplied) {
                    return originalCanStart;
                }

                if (hasText) {
                    const seenTextKey = textCacheState.resolvedKey || cacheKey;
                    self.trackCacheKeyUsage(seenTextKey, { harvestMissing: true });
                }
                if (hasChoices) {
                    for (const choice of originalChoices) {
                        self.trackCacheKeyUsage(self.getCacheKey(choice, 'choice'));
                    }
                }

                if (hasText && textReady) {
                    const translatedText = textCacheState.translated;
                    if (translatedText !== undefined) {
                        self.replaceMessageText(translatedText);
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

                this._translationApplied = true;

                return originalCanStart;
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

        if (typeof Window_ScrollText !== 'undefined') {
            if (!Window_ScrollText.prototype._translateOriginalStartMessage) {
                Window_ScrollText.prototype._translateOriginalStartMessage =
                    Window_ScrollText.prototype.startMessage;
            }

            Window_ScrollText.prototype.startMessage = function (...args) {
                const result = Window_ScrollText.prototype._translateOriginalStartMessage.apply(
                    this,
                    args
                );

                const translationEnabled = self.isTranslationEnabled();
                const skipping = self.isSkippingMessages();
                const allowTranslation = translationEnabled && !skipping;
                const useCacheOnly =
                    (translationEnabled && skipping) ||
                    (!translationEnabled && self.translateCacheWhenDisabled);

                if (!allowTranslation && !useCacheOnly) {
                    return result;
                }

                const originalText = typeof this._text === 'string' ? this._text : '';
                this._translateOriginalText = originalText;

                if (applyScrollTextFromCache(this, originalText)) {
                    return result;
                }

                if (!allowTranslation) {
                    return result;
                }

                const cacheKey = resolveScrollTextCacheKey(originalText);
                if (!cacheKey) {
                    return result;
                }

                if (self.pendingTranslations.has(cacheKey)) {
                    return result;
                }

                if (self.failedTranslations.has(cacheKey)) {
                    const failedTime = self.failedTranslations.get(cacheKey);
                    const cooldownMs = 5000;
                    if (Date.now() - failedTime < cooldownMs) {
                        return result;
                    }

                    self.failedTranslations.delete(cacheKey);
                }

                if (!self.batchManager) {
                    self.batchManager = createTranslationBatchManager(self);
                }

                self.pendingTranslations.set(cacheKey, true);

                self.batchManager
                    .runBatchedTranslation(
                        [
                            {
                                kind: 'directItems',
                                items: [
                                    {
                                        type: 'scroll_text',
                                        id: 'scroll_text_rt_0',
                                        value: originalText,
                                        cacheKey,
                                    },
                                ],
                                translationPhaseLabel: 'OTF - translating scroll text',
                                backgroundJob: false,
                                itemLimit: self.batchItemsLimit || 20,
                                charLimit: self.charLimit || 1000,
                                showSummary: false,
                            },
                        ],
                        {
                            translationPhaseLabel: 'OTF - translating scroll text',
                            backgroundJob: false,
                            showSummary: false,
                        }
                    )
                    .then((batchResult) => {
                        const translated = self.translationCache.get(cacheKey);
                        if (
                            typeof translated === 'string' &&
                            translated.trim() !== '' &&
                            this._translateOriginalText === originalText
                        ) {
                            this._text = translated;
                            if (typeof this.refresh === 'function') {
                                this.refresh();
                            }
                            return;
                        }

                        const failures = Array.isArray(batchResult?.failures)
                            ? batchResult.failures
                            : [];
                        if (failures.some((failure) => failure?.cacheKey === cacheKey)) {
                            self.failedTranslations.set(cacheKey, Date.now());
                        }
                    })
                    .catch((error) => {
                        self.failedTranslations.set(cacheKey, Date.now());
                        console.warn('[TranslateOnTheFly] Failed to translate scroll text', error);
                    })
                    .finally(() => {
                        self.pendingTranslations.delete(cacheKey);
                    });

                return result;
            };
        }

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

        // Hook Window_Command.prototype.makeCommandList to apply cached
        // translations after the original populates this._list.
        installCommandTranslationHook(self);
    },
};
