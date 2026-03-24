import { Alert } from "../../js/AlertHelper.js";

export const translateOnTheFlyMessageMethods = {
  replaceMessageText(translatedText) {
    // Do NOT extract \n<...> as speaker - these are RPG Maker script elements/plugin commands
    // Speaker name comes from $gameMessage._speakerName, not from text

    // Split translated text into lines
    const lines = translatedText.split("\n");

    // Clear current message texts
    $gameMessage._texts.length = 0;

    // Add translated lines (preserving all RPG Maker tags)
    for (const line of lines) {
      if (line || lines.length === 1) {
        // Keep empty lines if they're intentional
        $gameMessage._texts.push(line);
      }
    }
  },

  replaceChoiceText(translatedChoices) {
    if (!Array.isArray(translatedChoices)) {
      return;
    }

    $gameMessage._choices = translatedChoices.slice();
  },

  replaceSpeakerName(translatedSpeaker) {
    const safeSpeaker = this.normalizeSpeakerNameCase(
      (translatedSpeaker || "").trim(),
    );
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
      /\\[.!><\|^$]/g, // \., \!, \>, \<, \|, \^, \$
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
        new RegExp(placeholder, "g"),
        new RegExp(placeholder.replace(/X/g, "X\\s*"), "g"),
        new RegExp("X\\s*PROT\\s*X\\s*" + index + "\\s*X\\s*PROT\\s*X", "g"),
        new RegExp("XPROT X" + index + "X PROTX", "g"),
        new RegExp("X PROT X" + index + "X PROT X", "g"),
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
    cleaned = cleaned.replace(/>\s+「/g, ">「");
    cleaned = cleaned.replace(/>\s+『/g, ">『");

    // Fix common API spacing issues in escape sequences
    cleaned = cleaned.replace(/\\\s+n/g, "\\n");
    cleaned = cleaned.replace(/\\\s+c/g, "\\c");
    cleaned = cleaned.replace(/\\\s+v/g, "\\v");
    cleaned = cleaned.replace(/\\\s+p/g, "\\p");
    cleaned = cleaned.replace(/\\\s+g/g, "\\g");

    return cleaned;
  },

  wrapText(text, maxWidth) {
    if (!this.enableTextWrapping || !maxWidth || maxWidth <= 0) {
      return text;
    }

    // Function to calculate visible length (excluding escape sequences)
    const getVisibleLength = (str) => {
      // Remove all RPG Maker escape sequences: \n[N], \v[N], \c[N], \p[N], \g, etc.
      const withoutEscapes = str
        .replace(/\\[nvcpgif]\[\d+\]/gi, "")
        .replace(/\\[nvcpgif]/gi, "")
        .replace(/\\[!.^<>]/g, "");
      return withoutEscapes.length;
    };

    const lines = text.split("\n");
    const wrappedLines = [];

    for (const line of lines) {
      const visibleLength = getVisibleLength(line);

      if (visibleLength <= maxWidth) {
        wrappedLines.push(line);
        continue;
      }

      // Line is too long, need to wrap
      const words = line.split(" ");
      let currentLine = "";

      for (const word of words) {
        const wordVisibleLength = getVisibleLength(word);

        // If word itself is longer than maxWidth, split it
        if (wordVisibleLength > maxWidth) {
          if (currentLine) {
            wrappedLines.push(currentLine.trim());
            currentLine = "";
          }
          // Split long word into chunks based on visible length
          let remainingWord = word;
          while (getVisibleLength(remainingWord) > maxWidth) {
            // This is a simplified approach - just break at maxWidth
            wrappedLines.push(remainingWord.substring(0, maxWidth));
            remainingWord = remainingWord.substring(maxWidth);
          }
          if (remainingWord) {
            wrappedLines.push(remainingWord);
          }
          continue;
        }

        // Check if adding this word would exceed maxWidth
        const testLine = currentLine ? currentLine + " " + word : word;
        const testVisibleLength = getVisibleLength(testLine);

        if (testVisibleLength <= maxWidth) {
          currentLine = testLine;
        } else {
          // Adding word would exceed limit, start new line
          if (currentLine) {
            wrappedLines.push(currentLine.trim());
          }
          currentLine = word;
        }
      }

      // Add remaining text
      if (currentLine) {
        wrappedLines.push(currentLine.trim());
      }
    }

    return wrappedLines.join("\n");
  },

  async translateCommandName(commandName) {
    try {
      const cleanName = (commandName || "").trim();
      if (!cleanName) {
        return commandName;
      }

      const commandKey = this.getCacheKey(cleanName, "command");

      // Check cache first
      if (this.hasUsableCacheValue(commandKey)) {
        return this.translationCache.get(commandKey);
      }

      // If translation is in progress, return original for now
      if (this.pendingTranslations.has(commandKey)) {
        return commandName;
      }

      this.showSpinner();
      const result = await this.engine.batchTranslate([
        {
          type: "command",
          id: "cmd_0",
          value: cleanName,
          cacheKey: commandKey,
        },
      ]);
      this.hideSpinner();

      if (result.successes.length > 0) {
        const translated = result.successes[0].translated;
        this.setCacheValue(commandKey, translated);
        return translated;
      }

      if (result.failures.length > 0) {
        console.warn(
          "[TranslateOnTheFly] Failed to translate command:",
          cleanName,
          "→",
          result.failures[0].rejectReason,
        );
        this.markBatchFailuresAsUntranslated(result.failures, true);
      }

      return commandName;
    } catch (error) {
      console.error("[TranslateOnTheFly] Command translation error:", error);
      return commandName;
    }
  },

  async translateChoiceText(text) {
    try {
      const cleanText = (text || "").trim();
      if (!cleanText) {
        return text;
      }

      const { protectedText, protectedSequences } =
        this.protectSpecialSequences(cleanText);
      const translatedRaw =
        await this.translateWithSelectedEngine(protectedText);

      if (translatedRaw) {
        let translated = this.restoreSpecialSequences(
          translatedRaw,
          protectedSequences,
        );
        translated = this.cleanTranslatedText(translated);
        translated = this.wrapText(translated, this.maxLineWidth);
        return translated;
      }

      return text;
    } catch (error) {
      console.error("[TranslateOnTheFly] Choice translation API error:", error);
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
        const cacheKey = this.getCacheKey(choice, "choice");
        return {
          type: "choice",
          id: `choice_${i}`,
          value: choice,
          cacheKey,
        };
      })
      .filter((item) => !this.hasUsableCacheValue(item.cacheKey));

    if (items.length === 0) {
      // All individual choices cached, build result
      const translatedChoices = choices.map((choice) => {
        const cacheKey = this.getCacheKey(choice, "choice");
        return this.translationCache.get(cacheKey) || choice;
      });
      return { choices: translatedChoices, complete: true };
    }

    // Translate uncached choices
    this.showSpinner();
    const result = await this.engine.batchTranslate(items);
    this.hideSpinner();

    // Apply successes to cache
    for (const success of result.successes) {
      this.setCacheValue(success.cacheKey, success.translated);
    }

    // Build final choice array
    const translatedChoices = choices.map((choice) => {
      const cacheKey = this.getCacheKey(choice, "choice");
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
      const cleanName = (speakerName || "").trim();
      if (!cleanName) {
        return speakerName;
      }

      const translated = await this.translateWithSelectedEngine(cleanName, {
        skipWrap: true,
      });
      return this.normalizeSpeakerNameCase(translated || speakerName);
    } catch (error) {
      console.error(
        "[TranslateOnTheFly] Speaker name translation API error:",
        error,
      );
      return speakerName;
    }
  },

  normalizeSpeakerNameCase(name) {
    if (!name || typeof name !== "string") {
      return name;
    }

    // Capitalize first latin letter if present (helps translators that lowercase names)
    return name.replace(/^([a-z])/, (match) => match.toUpperCase());
  },

  async translateWithSelectedEngine(text, options = {}) {
    const sourceLang = this.sourceLang || "auto";
    const targetLang = this.targetLang || "en";
    const payload = (text || "").trim();

    if (!payload) {
      return text;
    }

    // Delegate to engine
    return await this.engine.translate(
      payload,
      sourceLang,
      targetLang,
      options,
    );
  },

  isEngineFullyConfigured() {
    if (!this.engine) {
      return false;
    }

    // Check if engine has isFullyConfigured method
    if (typeof this.engine.isFullyConfigured === "function") {
      return this.engine.isFullyConfigured();
    }

    // Fallback: assume fully configured if method doesn't exist
    return true;
  },

  async translateAndApplyCurrentMessage() {
    try {
      // Use stored $gameMessage reference instead of global one
      const gameMessage = this.currentGameMessage || $gameMessage;

      if (!gameMessage || typeof gameMessage.allText !== "function") {
        console.warn("[TranslateOnTheFly] No gameMessage available");
        return;
      }

      // Verify engine exists
      if (!this.engine || typeof this.engine.batchTranslate !== "function") {
        console.error(
          "[TranslateOnTheFly] No engine available or batchTranslate not found",
          {
            hasEngine: !!this.engine,
            engineType: this.engine ? this.engine.constructor.name : "null",
            hasBatchTranslate:
              this.engine && typeof this.engine.batchTranslate === "function",
          },
        );
        Alert.error("Translation engine not initialized");
        return;
      }

      // Get original text (before translation) or current text
      const originalText =
        gameMessage._translateOriginalText || gameMessage.allText();

      // Get original speaker (before translation) or current speaker
      const originalSpeakerName =
        gameMessage._translateOriginalSpeaker || gameMessage._speakerName || "";

      // Get original choices (before translation) or current choices
      const choices = gameMessage.choices ? gameMessage.choices() : [];
      const originalChoices = gameMessage._translateOriginalChoices || choices;
      const hasChoices =
        Array.isArray(originalChoices) && originalChoices.length > 0;

      // Validate that we have something to translate (text, speaker, or choices)
      const hasText = originalText && originalText.trim().length > 0;
      const hasSpeaker =
        originalSpeakerName && originalSpeakerName.trim().length > 0;

      if (!hasText && !hasSpeaker && !hasChoices) {
        console.warn(
          "[TranslateOnTheFly] Message text is empty and no choices or speaker",
        );
        return;
      }

      console.log("[TranslateOnTheFly] Translating current message:", {
        text: hasText ? originalText.substring(0, 50) : "(no text)",
        speaker: originalSpeakerName,
        choices: originalChoices,
      });

      // Build items array
      const items = [];
      let itemIdCounter = 0;

      // Add text
      const textKey = this.getCacheKey(originalText, "text");
      items.push({
        type: "text",
        id: `text_${itemIdCounter++}`,
        value: originalText,
        cacheKey: textKey,
      });

      // Add speaker
      if (originalSpeakerName && originalSpeakerName.trim().length > 0) {
        const speakerKey = this.getCacheKey(originalSpeakerName, "speaker");
        items.push({
          type: "speaker",
          id: `speaker_${itemIdCounter++}`,
          value: originalSpeakerName,
          cacheKey: speakerKey,
        });
      }

      // Add choices
      if (hasChoices) {
        for (let i = 0; i < originalChoices.length; i++) {
          const choice = originalChoices[i];
          const choiceKey = this.getCacheKey(choice, "choice");
          items.push({
            type: "choice",
            id: `choice_${itemIdCounter++}`,
            value: choice,
            cacheKey: choiceKey,
          });
        }
      }

      // Clear cache for these items to force re-translation
      for (const item of items) {
        this.deleteCacheValue(item.cacheKey, {
          persist: false,
          notify: false,
          deleteSeen: false,
        });
      }
      this.persistCache();
      this.notifyCacheRuntime("cache-force-retranslate");

      // Translate using batch
      this.showSpinner();
      const result = await this.engine.batchTranslate(items);
      this.hideSpinner();

      console.log("[TranslateOnTheFly] Translation result:", {
        successes: result.successes.length,
        failures: result.failures.length,
      });

      // Cache successes
      for (const success of result.successes) {
        this.setCacheValue(success.cacheKey, success.translated);
      }

      // Cache failures as empty strings (for harvesting untranslated strings)
      for (const failure of result.failures) {
        this.setCacheValue(failure.cacheKey, "");
      }

      // Log failures
      for (const failure of result.failures) {
        console.warn(
          `[TranslateOnTheFly] Failed to translate ${failure.type}:`,
          failure.value,
          "→",
          failure.rejectReason,
        );
      }
      this.markBatchFailuresAsUntranslated(result.failures, true);

      // Apply translations
      const translatedText = this.translationCache.get(textKey);
      if (translatedText) {
        this.replaceMessageText(translatedText);
        this.translationCount++;
        this.saveSettings();
      }

      // Apply speaker
      if (originalSpeakerName) {
        const speakerKey = this.getCacheKey(originalSpeakerName, "speaker");
        const translatedSpeaker = this.translationCache.get(speakerKey);
        if (translatedSpeaker) {
          this.replaceSpeakerName(translatedSpeaker);
        }
      }

      // Apply choices
      if (hasChoices) {
        const translatedChoices = originalChoices.map((choice) => {
          const choiceKey = this.getCacheKey(choice, "choice");
          return this.translationCache.get(choiceKey) || choice;
        });
        this.replaceChoiceText(translatedChoices);
      }

      // Force refresh the currently displayed message window
      if (this.currentMessageWindow && this.currentMessageWindow.isOpen()) {
        const msgWindow = this.currentMessageWindow;

        console.log(
          "[TranslateOnTheFly] Refreshing message window by close/open cycle",
        );

        // Save current state
        const wasOpen = msgWindow.isOpen();
        const currentOpenness = msgWindow.openness;

        if (wasOpen) {
          if (translatedText) {
            msgWindow.contents.clear();
            const tState = msgWindow.createTextState(translatedText, 0, 0, 5);
            msgWindow._textState = tState;
            msgWindow.pause = false;
          }
        }

        // If choices are displayed, refresh them too
        if (
          hasChoices &&
          SceneManager._scene &&
          SceneManager._scene._choiceListWindow
        ) {
          const choiceWindow = SceneManager._scene._choiceListWindow;
          if (choiceWindow.isOpen()) {
            choiceWindow.refresh();
          }
        }
      }

      console.log(
        "[TranslateOnTheFly] Translation applied and window refreshed",
      );
    } catch (error) {
      console.error("[TranslateOnTheFly] Translation error:", error);
      this.hideSpinner();
    }
  },
};
