import { TranslationBatchManager } from "../../translate-engines/batch-manager/TranslationBatchManager.js";

export const translateOnTheFlyRuntimeMethods = {
  setupTranslationHook() {
    const self = this;

    // Store original canStart if not already stored
    if (!Window_Message.prototype._originalCanStart) {
      Window_Message.prototype._originalCanStart =
        Window_Message.prototype.canStart;
    }

    // Override canStart to block until translation is ready
    Window_Message.prototype.canStart = function () {
      // Store reference to this message window and $gameMessage for Alt+R refresh
      self.currentMessageWindow = this;
      self.currentGameMessage = $gameMessage;

      const originalCanStart =
        Window_Message.prototype._originalCanStart.call(this);
      const translationEnabled = self.isTranslationEnabled();
      const skipping = self.isSkippingMessages();
      const allowTranslation = translationEnabled && !skipping;
      const useCacheOnly =
        (translationEnabled && skipping) ||
        (!translationEnabled && self.translateCacheWhenDisabled);

      if (
        translationEnabled &&
        allowTranslation &&
        !$gameMessage._translateOriginalText
      ) {
        // Lightweight trace to confirm hook runs after restart
        // console.log('[TranslateOnTheFly] canStart hook engaged, allowTranslation');
      }

      if (
        !originalCanStart ||
        (!translationEnabled && !useCacheOnly) ||
        !!BattleManager._phase
      ) {
        return originalCanStart;
      }

      const originalText =
        $gameMessage._translateOriginalText || $gameMessage.allText();
      const hasText = !!(originalText && originalText.trim().length > 0);

      // Remember original text (even empty) for later key lookups (startInput)
      if ($gameMessage._translateOriginalText === undefined) {
        $gameMessage._translateOriginalText = originalText || "";
      }

      const cacheKey = hasText ? self.getCacheKey(originalText, "text") : null;
      const choices = ($gameMessage.choices && $gameMessage.choices()) || [];
      const originalChoices = $gameMessage._translateOriginalChoices || choices;
      const hasChoices =
        Array.isArray(originalChoices) && originalChoices.length > 0;
      const choiceCacheKeys = hasChoices
        ? originalChoices.map((choice) => self.getCacheKey(choice, "choice"))
        : [];

      const originalSpeakerName =
        $gameMessage._translateOriginalSpeaker ||
        $gameMessage._speakerName ||
        "";
      const hasSpeakerName = !!(
        originalSpeakerName && originalSpeakerName.trim().length > 0
      );
      const speakerKey = hasSpeakerName
        ? self.getCacheKey(originalSpeakerName, "speaker")
        : null;
      const legacySpeakerKey = hasSpeakerName
        ? self.getLegacySpeakerCacheKey(originalSpeakerName)
        : null;
      if (hasSpeakerName) {
        $gameMessage._translateOriginalSpeaker = originalSpeakerName;
      }

      if (
        hasSpeakerName &&
        legacySpeakerKey &&
        self.translationCache.has(legacySpeakerKey) &&
        !self.translationCache.has(speakerKey)
      ) {
        const legacyValue = self.translationCache.get(legacySpeakerKey);
        self.setCacheValue(speakerKey, legacyValue);
      }

      if (self.shouldTrackRealtimeCacheUsage()) {
        if (hasText) {
          self.touchRealtimeEntry(originalText, "text");
        }
        if (hasChoices) {
          for (const choice of originalChoices) {
            self.touchRealtimeEntry(choice, "choice");
          }
        }
      }

      const textReady =
        !hasText || (cacheKey && self.hasUsableCacheValue(cacheKey));
      const choicesReady =
        !hasChoices ||
        choiceCacheKeys.every((key) => self.hasUsableCacheValue(key));
      const speakerReady =
        !hasSpeakerName || self.hasUsableCacheValue(speakerKey);

      if (useCacheOnly) {
        if (!this._translationApplied && hasText && textReady) {
          const translatedText = self.translationCache.get(cacheKey);
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
          const cachedSpeaker =
            self.translationCache.get(speakerKey) ||
            self.translationCache.get(legacySpeakerKey);
          self.replaceSpeakerName(cachedSpeaker);
        }

        return originalCanStart;
      }

      // Check if this message was already translated
      if (!this._translationApplied) {
        // If we have cached translation, apply it now (text + choices + speaker)
        if (allowTranslation && textReady && choicesReady && speakerReady) {
          if (hasText) {
            const translatedText = cacheKey
              ? self.translationCache.get(cacheKey)
              : null;
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
          console.log("[TranslateOnTheFly] Applied cached translation");
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
        if (
          allowTranslation &&
          cacheKey &&
          self.failedTranslations.has(cacheKey)
        ) {
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
          const logPrefix =
            maxDepth > 0 ? "ahead translation batch" : "translation";
          console.log(
            `[TranslateOnTheFly] Starting 01 ${logPrefix} for:`,
            originalText.substring(0, 50),
          );

          self.requestForegroundDialogBatch({
            currentText: originalText,
            currentSpeakerName: originalSpeakerName,
            cacheKey,
            maxDepth,
            sourceTrigger: "Starting 01",
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
            ...choiceCacheKeys.map(
              (key) => self.failedTranslations.get(key) || 0,
            ),
          );
          const cooldownMs = 5000;
          if (Date.now() - failedTime < cooldownMs) {
            // Use original choices during cooldown and skip retry
            self.replaceChoiceText(originalChoices);
            // Still apply cached text/speaker if available so dialog is translated
            if (!this._translationApplied) {
              if (hasText && textReady) {
                const translatedText = cacheKey
                  ? self.translationCache.get(cacheKey)
                  : null;
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
              ? "ahead translation batch for choices"
              : "translation for choices";
          console.log(`[TranslateOnTheFly] Starting 02 ${logPrefix}`);

          self.requestForegroundDialogBatch({
            currentText: originalText || "",
            currentSpeakerName: originalSpeakerName,
            cacheKey: cacheKey || self.getCacheKey(originalText || "", "text"),
            maxDepth,
            sourceTrigger: "Starting 02",
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
            currentText: originalText || "",
            currentSpeakerName: originalSpeakerName,
            cacheKey: cacheKey || self.getCacheKey(originalText || "", "text"),
            maxDepth,
            sourceTrigger: "speaker",
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
      }
      Window_Message.prototype._originalTerminateMessage.call(this);
    };

    // Hook Game_Message.setChoices to translate choices as soon as they are set
    if (!Game_Message.prototype._originalSetChoices) {
      Game_Message.prototype._originalSetChoices =
        Game_Message.prototype.setChoices;
    }

    Game_Message.prototype.setChoices = function (
      choices,
      defaultType,
      cancelType,
    ) {
      Game_Message.prototype._originalSetChoices.call(
        this,
        choices,
        defaultType,
        cancelType,
      );

      // Store original choices for stable cache keys (they may be mutated later)
      this._translateOriginalChoices = (choices || []).slice();

      const translationEnabled = self.isTranslationEnabled();
      const skipping = self.isSkippingMessages();

      if (!translationEnabled) {
        return;
      }

      const choiceKeys = this._translateOriginalChoices.map((choice) =>
        self.getCacheKey(choice, "choice"),
      );

      // If all choices already cached, replace immediately
      if (
        choiceKeys.length > 0 &&
        choiceKeys.every((key) => self.hasUsableCacheValue(key))
      ) {
        const translated = this._translateOriginalChoices.map((choice, idx) => {
          const key = choiceKeys[idx];
          return self.translationCache.get(key) || choice;
        });
        self.replaceChoiceText(translated);
        return;
      }

      if (skipping) {
        return;
      }

      // Don't translate here - choices will be translated together with text in startAheadTranslation
    };

    // Block entering choice input until choices are translated
    if (!Window_Message.prototype._originalStartInput) {
      Window_Message.prototype._originalStartInput =
        Window_Message.prototype.startInput;
    }

    Window_Message.prototype.startInput = function () {
      const translationEnabled = self.isTranslationEnabled();
      const skipping = self.isSkippingMessages();
      const allowTranslation = translationEnabled && !skipping;
      const useCacheOnly =
        (translationEnabled && skipping) ||
        (!translationEnabled && self.translateCacheWhenDisabled);

      const originalText =
        $gameMessage._translateOriginalText || $gameMessage.allText();
      const hasText = !!(originalText && originalText.trim().length > 0);
      const textKey = hasText ? self.getCacheKey(originalText, "text") : null;
      const originalSpeakerName =
        $gameMessage._translateOriginalSpeaker ||
        $gameMessage._speakerName ||
        "";

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
          if (!this._translationApplied && !self.hasUsableCacheValue(textKey)) {
            return false; // text not translated/applied yet
          }
        }
      }

      if ((translationEnabled || useCacheOnly) && $gameMessage.isChoice()) {
        const choices = $gameMessage.choices();
        const originalChoices =
          $gameMessage._translateOriginalChoices || choices;
        const choiceKeys = originalChoices.map((choice) =>
          self.getCacheKey(choice, "choice"),
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
            ...choiceKeys.map((key) => self.failedTranslations.get(key) || 0),
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
            "[TranslateOnTheFly] Choices not in cache (should have been translated with text)",
          );
          self.replaceChoiceText(originalChoices);

          // Kick off a batch translate for the event (unless already pending) and block until ready
          if (!choiceKeys.some((key) => self.pendingTranslations.has(key))) {
            const maxDepth = self.tryTranslateAhead ? 999 : 0;
            const logPrefix =
              maxDepth > 0
                ? "ahead translation batch for choices (startInput fallback)"
                : "translation for choices (startInput fallback)";
            console.log(`[TranslateOnTheFly] Starting 03 ${logPrefix}`);

            self.requestForegroundDialogBatch({
              currentText: originalText || "",
              currentSpeakerName: originalSpeakerName,
              cacheKey: textKey || self.getCacheKey(originalText || "", "text"),
              maxDepth,
              sourceTrigger: "Starting 03",
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
        "[TranslateOnTheFly] Extracted save contents, applying cached translations if any",
      );

      self.applyCachedActorClassEnemyTranslations();
      console.log(
        "[TranslateOnTheFly] Applied cached translations to $dataActors, $dataClasses, $dataEnemies and their game objects",
      );
    };

    if (!DataManager._createGameObjects) {
      DataManager._createGameObjects = DataManager.createGameObjects;
    }

    DataManager.createGameObjects = function () {
      DataManager._createGameObjects();
      console.log(
        "[TranslateOnTheFly] Created game objects, applying cached translations if any",
      );
      self.applyCachedActorClassEnemyTranslations();
      console.log(
        "[TranslateOnTheFly] Applied cached translations to $dataActors, $dataClasses, $dataEnemies and their game objects",
      );
    };

    // Hook Window_Command.prototype.refresh to translate commands before rendering
    if (!Window_Command.prototype._originalRefresh) {
      Window_Command.prototype._originalRefresh =
        Window_Command.prototype.refresh;
    }

    Window_Command.prototype.refresh = async function () {
      const translationEnabled = self.isTranslationEnabled();
      const useCacheOnly =
        !translationEnabled && self.translateCacheWhenDisabled;

      // If translation is completely disabled, use original
      if (!translationEnabled && !useCacheOnly) {
        return Window_Command.prototype._originalRefresh.call(this);
      }

      // Mark that we're in refresh - addCommand will collect names
      this._collectingCommands = true;
      this._collectedCommands = [];

      console.log(
        "[TranslateOnTheFly] Refreshing command window, collecting commands for translation",
        $dataSystem,
      );
      // First time only: collect system command terms for translation
      if (
        !self._systemCommandsCollected &&
        $dataSystem &&
        $dataSystem.terms &&
        $dataSystem.terms.commands &&
        !$dataSystem.terms.commandsOriginal
      ) {
        const systemCommands = $dataSystem.terms.commands.filter(
          (cmd) => !!cmd,
        );
        for (const cmdName of systemCommands) {
          this._collectedCommands.push({
            name: cmdName,
            symbol: "dummy",
            enabled: true,
            ext: null,
            isAdditional: true,
          });
        }
        self._systemCommandsCollected = true;
        console.log(
          `[TranslateOnTheFly] Collected ${systemCommands.length} system commands for translation`,
        );
      }

      // Call original makeCommandList to collect all command names
      this.clearCommandList();
      this.makeCommandList();

      // Restore normal mode
      this._collectingCommands = false;

      const commandsToTranslate = this._collectedCommands.filter((cmd) => {
        // Skip choices - they are already translated during event processing
        if (cmd.symbol === "choice") {
          return false;
        }

        if (
          !cmd.name ||
          typeof cmd.name !== "string" ||
          cmd.name.trim() === ""
        ) {
          return false;
        }

        if (
          $dataSystem?.terms?.commandsOriginal &&
          $dataSystem.terms.commands.includes(cmd.name)
        ) {
          // This is a system command already translated once - skip
          return false;
        }

        const commandKey = self.getCacheKey(cmd.name, "command");
        // Only translate if not cached
        return !self.hasUsableCacheValue(commandKey);
      });

      if (commandsToTranslate.length > 0) {
        const items = commandsToTranslate.map((cmd, i) => ({
          type: "command",
          id: `cmd_${i}`,
          value: cmd.name,
          cacheKey: self.getCacheKey(cmd.name, "command"),
        }));

        const harvestOnly =
          useCacheOnly ||
          (typeof self.isNonOtfTranslationProcessActive === "function" &&
            self.isNonOtfTranslationProcessActive());

        // Cache-only mode means harvesting keys only. Do not translate on the fly.
        if (harvestOnly) {
          for (const item of items) {
            self.setCacheValue(item.cacheKey, "");
          }
          console.log(
            `[TranslateOnTheFly] Harvested ${items.length} menu options to cache without translation`,
          );
        } else if (translationEnabled) {
          console.log(
            `[TranslateOnTheFly] Batch translating ${commandsToTranslate.length} commands`,
          );

          try {
            if (!self.batchManager) {
              self.batchManager = new TranslationBatchManager(self);
            }

            const result = await self.batchManager.runBatchedTranslation(
              items,
              {
                stepLabel: "translating menu options",
                backgroundJob: false,
                itemLimit: self.batchItemsLimit || 20,
                charLimit: self.charLimit || 1000,
                showSummary: false,
              },
            );

            // Cache successes
            for (const success of result.successes) {
              self.setCacheValue(success.cacheKey, success.translated);
              console.log(
                `[TranslateOnTheFly] Cached command: "${items.find((i) => i.cacheKey === success.cacheKey).value}" → "${success.translated}"`,
              );
            }

            // Cache failures as empty strings (for harvesting untranslated strings)
            for (const failure of result.failures) {
              self.setCacheValue(failure.cacheKey, "");
              console.warn(
                `[TranslateOnTheFly] Failed to translate command (cached as empty):`,
                failure.value,
                "→",
                failure.rejectReason,
              );
            }

            // Mark failures
            self.markBatchFailuresAsUntranslated(result.failures, true);
          } catch (error) {
            console.error(
              "[TranslateOnTheFly] Batch command translation error:",
              error,
            );
            self.markBatchItemsAsUntranslated(items, true);
          }
        }
      }
      this._collectedCommands = this._collectedCommands.filter(
        (cmd) => cmd && !cmd.isAdditional,
      );

      // Now add all commands with translations (from cache or original)
      this.clearCommandList();
      for (const cmd of this._collectedCommands) {
        let finalName = cmd.name;

        if (
          cmd.name &&
          typeof cmd.name === "string" &&
          cmd.name.trim() !== ""
        ) {
          const commandKey = self.getCacheKey(cmd.name, "command");
          if (self.hasUsableCacheValue(commandKey)) {
            finalName = self.translationCache.get(commandKey);
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
      Window_Command.prototype._originalAddCommand =
        Window_Command.prototype.addCommand;
    }

    Window_Command.prototype.addCommand = function (
      name,
      symbol,
      enabled = true,
      ext = null,
    ) {
      if (this._collectingCommands) {
        console.log(
          "[TranslateOnTheFly] Collected command for translation:",
          name,
          symbol,
        );
        this._collectedCommands.push({ name, symbol, enabled, ext });
        return;
      }

      // Normal mode - use original
      return Window_Command.prototype._originalAddCommand.call(
        this,
        name,
        symbol,
        enabled,
        ext,
      );
    };
  },

  async translateGameArrays(options = {}) {
    const isBackgroundJob = !!options.backgroundJob;
    const progressLabel = options.progressLabel || "translating game arrays";
    const showSummary = options.showSummary !== false;
    const isPhase = !!options.isPhase;
    console.log("[TranslateOnTheFly] Starting translation of game data arrays");

    if (!this.batchManager) {
      this.batchManager = new TranslationBatchManager(this);
    }

    if (!this.isEngineFullyConfigured()) {
      console.log(
        "[TranslateOnTheFly] Engine not fully configured, skipping game arrays",
      );
      return {
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        stats: null,
        summary: null,
      };
    }

    const arrays = this.getGameArrayDefs();
    const candidates =
      typeof this.collectGameArrayCandidates === "function"
        ? this.collectGameArrayCandidates()
        : { uniqueValues: [], pendingValues: [] };

    if (candidates.uniqueValues.length === 0) {
      console.log(
        "[TranslateOnTheFly] No candidate strings found in game arrays",
      );
      return {
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        stats: null,
        summary: null,
      };
    }

    const pendingValues = candidates.pendingValues;

    if (pendingValues.length === 0) {
      console.log("[TranslateOnTheFly] All array strings already cached");
      const translated = await this.batchManager.runBatchedTranslation([], {
        stepLabel: progressLabel,
        backgroundJob: isBackgroundJob,
        itemLimit: this.batchItemsLimit || 20,
        charLimit: this.charLimit || 1000,
        isPhase,
        showSummary,
      });

      this.persistCache();
      console.log(
        "[TranslateOnTheFly] Completed translation of game data arrays",
      );
      return {
        successCount: translated.successes.length,
        failureCount: translated.failures.length,
        totalCount: 0,
        stats: translated.stats,
        summary: translated.summary,
      };
    } else {
      // Build translation items and delegate chunking/progress to the shared batch manager.
      const items = [];
      let idCounter = 0;
      for (const pv of pendingValues) {
        items.push({
          type: pv.types[0],
          id: `sys_${idCounter++}`,
          value: pv.value,
          cacheKey: this.getCacheKey(pv.value, pv.types[0]),
          meta: pv,
        });
      }

      console.log(
        `[TranslateOnTheFly] Translating ${items.length} unique strings`,
      );

      const translated = await this.batchManager.runBatchedTranslation(
        items.map((item) => ({
          type: item.type,
          id: item.id,
          value: item.value,
          cacheKey: item.cacheKey,
        })),
        {
          stepLabel: progressLabel,
          backgroundJob: isBackgroundJob,
          itemLimit: this.batchItemsLimit || 20,
          charLimit: this.charLimit || 1000,
          isPhase,
          showSummary,
        },
      );

      const itemMetaByCacheKey = new Map(
        items.map((item) => [item.cacheKey, item.meta]),
      );

      for (const success of translated.successes) {
        const originalValue = success && success.value;
        const meta = success ? itemMetaByCacheKey.get(success.cacheKey) : null;
        const types = meta && Array.isArray(meta.types) ? meta.types : [];
        for (const type of types) {
          this.setCacheValue(
            this.getCacheKey(originalValue, type),
            success.translated,
          );
        }
      }

      for (const failure of translated.failures) {
        console.warn(
          "[TranslateOnTheFly] Failed to translate array value:",
          failure.value,
          "->",
          failure.rejectReason,
        );
      }
      this.markBatchFailuresAsUntranslated(translated.failures, true);

      // Finally, for each array make Original copy and apply cached translations (if any)
      for (const entry of arrays) {
        const parentObj = entry.parent();
        if (!parentObj || !Array.isArray(parentObj[entry.prop])) continue;

        try {
          const liveArr = parentObj[entry.prop];
          // If Original doesn't exist yet, create it from current live array
          const hasOriginal = Array.isArray(parentObj[`${entry.prop}Original`]);
          const originalCopy = hasOriginal
            ? parentObj[`${entry.prop}Original`]
            : Array.isArray(liveArr)
              ? liveArr.slice()
              : [];
          if (!hasOriginal) {
            parentObj[`${entry.prop}Original`] = originalCopy.slice();
          }

          // Overwrite main array entries with cached translations when available
          for (let i = 0; i < originalCopy.length; i++) {
            const v = originalCopy[i];
            if (v == null) {
              parentObj[entry.prop][i] = v;
              continue;
            }
            if (typeof v !== "string") {
              parentObj[entry.prop][i] = v;
              continue;
            }
            const trimmed = v.trim();
            if (!trimmed) {
              parentObj[entry.prop][i] = v;
              continue;
            }

            // Try all possible types for this value; prefer the entry.type first
            const candidateTypes = [entry.type];
            const cacheKeyPrimary = this.getCacheKey(trimmed, entry.type);
            if (this.hasUsableCacheValue(cacheKeyPrimary)) {
              parentObj[entry.prop][i] =
                this.translationCache.get(cacheKeyPrimary);
              continue;
            }

            // If not found under primary type, attempt to find under any other type (fallback)
            let applied = false;
            for (const e of arrays) {
              const fallbackKey = this.getCacheKey(trimmed, e.type);
              if (this.hasUsableCacheValue(fallbackKey)) {
                parentObj[entry.prop][i] =
                  this.translationCache.get(fallbackKey);
                applied = true;
                break;
              }
            }

            if (!applied) {
              // keep original
              parentObj[entry.prop][i] = v;
            }
          }
        } catch (error) {
          console.error(
            "[TranslateOnTheFly] Failed applying translations to array",
            entry.prop,
            error,
          );
        }
      }

      // Persist cache after modifications
      this.persistCache();
      console.log(
        "[TranslateOnTheFly] Completed translation of game data arrays",
      );
      return {
        successCount: translated.successes.length,
        failureCount: translated.failures.length,
        totalCount: items.length,
        stats: translated.stats,
        summary: translated.summary,
      };
    }
  },
};
