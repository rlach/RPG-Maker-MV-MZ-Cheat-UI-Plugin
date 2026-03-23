import { Alert } from "../../js/AlertHelper.js";
import { BatchSummaryReporter } from "../../translate-engines/batch-manager/BatchSummaryReporter.js";
import { TranslationBatchManager } from "../../translate-engines/batch-manager/TranslationBatchManager.js";

export const translateOnTheFlyFlowMethods = {
  hasPendingDialogTranslation() {
    if (this.isForegroundDialogBatchActive()) {
      return true;
    }

    if (!this.pendingTranslations || this.pendingTranslations.size === 0) {
      return false;
    }

    for (const key of this.pendingTranslations.keys()) {
      if (typeof key !== "string") continue;
      if (
        key.startsWith("text:") ||
        key.startsWith("speaker:") ||
        key.startsWith("choice:")
      ) {
        return true;
      }
    }

    return false;
  },

  isForegroundDialogBatchActive() {
    return !!(
      this._foregroundDialogBatchState &&
      this._foregroundDialogBatchState.active
    );
  },

  async waitForForegroundDialogBatch() {
    const state = this._foregroundDialogBatchState;
    if (state && state.active && state.promise) {
      try {
        await state.promise;
      } catch (e) {
        // Foreground errors are handled by the caller pipeline.
      }
    }
  },

  async waitForBackgroundTranslationSlot() {
    const hasBackgroundJob = () => {
      return !!(this.objectTranslationJob && this.objectTranslationJob.active);
    };

    while (hasBackgroundJob() && this.hasPendingDialogTranslation()) {
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
  },

  isBackgroundPreemptedResult(result) {
    if (!result || typeof result !== "object") {
      return false;
    }

    if (Array.isArray(result.successes) && result.successes.length > 0) {
      return false;
    }

    if (!Array.isArray(result.failures) || result.failures.length === 0) {
      return false;
    }

    return result.failures.every((failure) => {
      return !!(
        failure &&
        (failure.preempted || failure.cancelReason === "background_preempted")
      );
    });
  },

  async batchTranslateWithBackgroundRetry(items, label = "background batch") {
    const safeItems = Array.isArray(items) ? items : [];
    if (safeItems.length === 0) {
      return { successes: [], failures: [] };
    }

    const maxPreemptedRetries = 5;
    let attempts = 0;

    while (attempts <= maxPreemptedRetries) {
      await this.waitForBackgroundTranslationSlot();
      const result = await this.engine.batchTranslate(safeItems, {
        backgroundJob: true,
      });

      if (!this.isBackgroundPreemptedResult(result)) {
        return result;
      }

      attempts += 1;
      if (attempts > maxPreemptedRetries) {
        return result;
      }

      console.log(
        `[TranslateOnTheFly] Background batch preempted (${label}), instant retry ${attempts}/${maxPreemptedRetries}`,
      );
      if (
        this.batchManager &&
        typeof this.batchManager.onBatchPausedByOtf === "function"
      ) {
        this.batchManager.onBatchPausedByOtf("translating event");
      }
      await this.waitForForegroundDialogBatch();
      if (
        this.batchManager &&
        typeof this.batchManager.onBatchResumed === "function"
      ) {
        this.batchManager.onBatchResumed(label);
      }
    }

    return { successes: [], failures: [] };
  },

  buildForegroundOperationKey({ currentText, currentSpeakerName, maxDepth }) {
    const interpreter = this.findMessageInterpreter();
    const normalized = this.resolveOriginalMessageContext(
      currentText,
      currentSpeakerName,
      interpreter,
    );
    const normalizedText = normalized.text || currentText || "";
    const normalizedSpeaker = normalized.speaker || currentSpeakerName || "";

    const choices =
      $gameMessage && typeof $gameMessage.choices === "function"
        ? $gameMessage._translateOriginalChoices || $gameMessage.choices() || []
        : [];

    const choiceKeyPart = Array.isArray(choices)
      ? choices.map((choice) => this.getCacheKey(choice, "choice")).join("|")
      : "";

    const mapId =
      window.$gameMap && typeof $gameMap.mapId === "function"
        ? $gameMap.mapId()
        : 0;
    const eventId =
      interpreter && typeof interpreter._eventId === "number"
        ? interpreter._eventId
        : 0;
    const index =
      interpreter && typeof interpreter._index === "number"
        ? interpreter._index
        : 0;
    const depth = Number(maxDepth) || 0;

    return [
      mapId,
      eventId,
      index,
      depth,
      this.getCacheKey(normalizedText, "text"),
      this.getCacheKey(normalizedSpeaker, "speaker"),
      choiceKeyPart,
    ].join("::");
  },

  preemptBackgroundForForeground(operationKey, sourceTrigger = "unknown") {
    if (!this.cancelBackgroundForOnTheFly) {
      return false;
    }

    if (
      !this.engine ||
      typeof this.engine.cancelActiveBackgroundRequest !== "function"
    ) {
      return false;
    }

    if (this._foregroundPreemptedOperationKey === operationKey) {
      return false;
    }

    if (
      typeof this.engine.hasActiveBackgroundRequest === "function" &&
      !this.engine.hasActiveBackgroundRequest()
    ) {
      return false;
    }

    const cancelled = this.engine.cancelActiveBackgroundRequest();
    if (cancelled) {
      this._foregroundPreemptedOperationKey = operationKey;
      console.log(
        `[TranslateOnTheFly] Foreground preempted active background request (trigger: ${sourceTrigger})`,
      );
    }

    return cancelled;
  },

  requestForegroundDialogBatch({
    currentText,
    currentSpeakerName,
    cacheKey,
    maxDepth,
    sourceTrigger = "unknown",
  }) {
    if (!this._foregroundDialogBatchState) {
      this._foregroundDialogBatchState = {
        active: false,
        operationKey: "",
        sourceTrigger: "",
        startedAt: 0,
        promise: null,
      };
    }

    const state = this._foregroundDialogBatchState;
    const operationKey = this.buildForegroundOperationKey({
      currentText,
      currentSpeakerName,
      maxDepth,
    });

    if (state.active && state.promise) {
      return state.promise;
    }

    this.preemptBackgroundForForeground(operationKey, sourceTrigger);

    const promise = Promise.resolve().then(() =>
      this.startAheadTranslation({
        currentText,
        currentSpeakerName,
        cacheKey,
        maxDepth,
      }),
    );

    state.active = true;
    state.operationKey = operationKey;
    state.sourceTrigger = sourceTrigger;
    state.startedAt = Date.now();
    state.promise = promise;

    const watchdogMs = this._foregroundBatchWatchdogMs || 60000;
    setTimeout(() => {
      if (!state.active || state.promise !== promise) {
        return;
      }

      console.warn(
        `[TranslateOnTheFly] Foreground batch watchdog released lock after ${watchdogMs}ms`,
      );
      state.active = false;
      state.operationKey = "";
      state.sourceTrigger = "";
      state.startedAt = 0;
      state.promise = null;
    }, watchdogMs);

    return promise.finally(() => {
      if (state.promise !== promise) {
        return;
      }

      state.active = false;
      state.operationKey = "";
      state.sourceTrigger = "";
      state.startedAt = 0;
      state.promise = null;
      this._foregroundPreemptedOperationKey = "";
    });
  },

  updateObjectTranslationProgress() {
    const job = this.objectTranslationJob;
    const progress = BatchSummaryReporter.buildProgress({
      title: job.currentTypeLabel
        ? `translating ${job.currentTypeLabel}`
        : "translating object translation",
      processed: job.currentDone,
      total: job.currentTotal,
      currentStepErrors: job.currentErrors,
      currentStepProcessed: job.currentDone,
      totalErrors: job.runErrors,
    });
    this.updateProgressBox(
      progress.title,
      progress.message,
      null,
      null,
      progress.totalErrorsLine,
    );
  },

  async runObjectTranslationJob(selectedTypeIds) {
    if (this.objectTranslationJob.active) {
      Alert.warn("Object translation is already in progress");
      return;
    }

    if (!this.engine || typeof this.engine.batchTranslate !== "function") {
      Alert.error("Translation engine not initialized");
      return;
    }

    if (!this.isEngineFullyConfigured()) {
      Alert.warn("Translation engine is not fully configured");
      return;
    }

    const allStats = this.getObjectTranslationStats();
    const selectedStats = allStats.filter((stat) =>
      selectedTypeIds.includes(stat.id),
    );
    const defsById = new Map(
      this.getObjectTranslationTypeDefs().map((def) => [def.id, def]),
    );

    const totalTarget = selectedStats.reduce(
      (sum, stat) => sum + (stat.leftStrings || 0),
      0,
    );

    this.objectTranslationJob = {
      active: true,
      currentTypeLabel: "",
      currentDone: 0,
      currentTotal: 0,
      currentErrors: 0,
      totalDone: 0,
      totalTarget,
      runErrors: 0,
    };

    const startedAt = Date.now();
    const aggregatedErrorStats =
      BatchSummaryReporter.createErrorStatsAccumulator();
    const mergeStats = (stats) => {
      BatchSummaryReporter.mergeErrorStats(aggregatedErrorStats, stats);
    };

    try {
      this.applyCachedTranslationsToData();

      for (const stat of selectedStats) {
        const def = defsById.get(stat.id);
        if (!def || stat.left <= 0) {
          continue;
        }

        this.objectTranslationJob.currentTypeLabel = stat.label;
        this.objectTranslationJob.currentDone = 0;
        this.objectTranslationJob.currentTotal = stat.left;
        this.objectTranslationJob.currentErrors = 0;
        if (def.kind !== "mapEvents" && def.kind !== "gameArrays") {
          this.updateObjectTranslationProgress();
        }

        if (def.kind === "systemMessages") {
          const batchResult = await this.translateSystemMessagesBatch(true);
          this.objectTranslationJob.currentDone = stat.left;
          this.objectTranslationJob.currentErrors = batchResult.failures;
          this.objectTranslationJob.totalDone += batchResult.successes;
          this.objectTranslationJob.runErrors += batchResult.failures;
          mergeStats(batchResult.stats);
          this.updateObjectTranslationProgress();
          continue;
        }

        if (def.kind === "systemCommands") {
          const batchResult = await this.translateSystemCommandsBatch(true);
          this.objectTranslationJob.currentDone = stat.left;
          this.objectTranslationJob.currentErrors = batchResult.failures;
          this.objectTranslationJob.totalDone += batchResult.successes;
          this.objectTranslationJob.runErrors += batchResult.failures;
          mergeStats(batchResult.stats);
          this.updateObjectTranslationProgress();
          continue;
        }

        if (def.kind === "gameArrays") {
          const batchResult = await this.translateGameArrays({
            backgroundJob: true,
            progressLabel: `translating ${stat.label}`,
            showSummary: false,
          });
          this.objectTranslationJob.totalDone += batchResult.successCount || 0;
          this.objectTranslationJob.runErrors += batchResult.failureCount || 0;
          mergeStats(batchResult.stats);
          continue;
        }

        if (def.kind === "commonEvents") {
          const batchResult = await this.translateMapEvents(
            {
              events: [
                {
                  pages: $dataCommonEvents,
                },
              ],
            },
            -1,
            null,
            "translating common events",
          );
          this.objectTranslationJob.currentDone = stat.leftStrings || stat.left;
          this.objectTranslationJob.currentErrors =
            batchResult.failureCount || 0;
          this.objectTranslationJob.totalDone += batchResult.successCount || 0;
          this.objectTranslationJob.runErrors += batchResult.failureCount || 0;
          mergeStats(batchResult.stats);
          this.updateObjectTranslationProgress();
          continue;
        }

        if (def.kind === "mapEvents") {
          const validMaps = this.getValidMapInfos();
          const selectedMapIds = new Set(
            this.getSelectedObjectTranslationMapIds(validMaps),
          );
          const mapsToTranslate = validMaps.filter((mapInfo) =>
            selectedMapIds.has(mapInfo.id),
          );

          for (
            let mapIndex = 0;
            mapIndex < mapsToTranslate.length;
            mapIndex++
          ) {
            const mapInfo = mapsToTranslate[mapIndex];
            const mapNumber = mapIndex + 1;
            const mapData = await this.loadMapDataById(mapInfo.id);
            const batchResult = await this.translateMapEvents(
              mapData,
              mapNumber,
              mapsToTranslate.length,
              `translating map ${mapNumber}/${mapsToTranslate.length}`,
            );
            this.objectTranslationJob.totalDone +=
              batchResult.successCount || 0;
            this.objectTranslationJob.totalTarget +=
              batchResult.totalCount || 0;
            this.objectTranslationJob.runErrors +=
              batchResult.failureCount || 0;
            mergeStats(batchResult.stats);
          }

          continue;
        }

        const container = def.getContainer && def.getContainer();
        if (!Array.isArray(container)) {
          continue;
        }

        const pendingObjects = [];
        for (let i = 1; i < container.length; i++) {
          const item = container[i];
          if (!item) continue;
          const hasUntranslated = this.hasUntranslatedFields(
            item,
            def.fields,
            def.cachePrefix,
          );
          if (hasUntranslated) {
            pendingObjects.push(item);
          }
        }

        const BATCH_SIZE = 10;
        for (let i = 0; i < pendingObjects.length; i += BATCH_SIZE) {
          const batch = pendingObjects.slice(i, i + BATCH_SIZE);
          const batchResult = await this.translateDataBatch(
            batch,
            def.fields,
            def.cachePrefix,
            { backgroundJob: true },
          );
          this.objectTranslationJob.currentDone += batch.length;
          this.objectTranslationJob.currentErrors += batchResult.failures;
          this.objectTranslationJob.totalDone += batchResult.successes;
          this.objectTranslationJob.runErrors += batchResult.failures;
          mergeStats(batchResult.stats);
          this.updateObjectTranslationProgress();
        }
      }

      const summary = BatchSummaryReporter.buildSummary({
        batchLabel: "object translation",
        totalItems: this.objectTranslationJob.totalTarget,
        successes: this.objectTranslationJob.totalDone,
        failures: this.objectTranslationJob.runErrors,
        errorStats: aggregatedErrorStats,
        durationMs: Date.now() - startedAt,
      });
      BatchSummaryReporter.showAlert(summary);
      BatchSummaryReporter.logSummary(summary);
    } catch (error) {
      console.error(
        "[TranslateOnTheFly] Object translation job failed:",
        error,
      );
      Alert.error(`Object translation failed: ${error.message || error}`);
    } finally {
      this.objectTranslationJob.active = false;
      this.hideProgressBox();
    }
  },

  async translateSystemCommandsBatch(backgroundJob = false) {
    if (!this.batchManager) {
      this.batchManager = new TranslationBatchManager(this);
    }

    const result =
      await this.batchManager.translateSystemCommandsBatch(backgroundJob);
    return {
      successes: result.successes,
      failures: result.failures,
      stats: result.stats,
    };
  },

  async translateSystemMessagesBatch(backgroundJob = false) {
    if (!this.batchManager) {
      this.batchManager = new TranslationBatchManager(this);
    }

    const result =
      await this.batchManager.translateSystemMessagesBatch(backgroundJob);
    return {
      successes: result.successes,
      failures: result.failures,
      stats: result.stats,
    };
  },

  findMessageInterpreter() {
    const candidates = [];

    if (window.$gameMap) {
      if ($gameMap._interpreter) {
        candidates.push($gameMap._interpreter);
      }

      if (typeof $gameMap.events === "function") {
        for (const ev of $gameMap.events()) {
          if (ev && ev._interpreter) {
            candidates.push(ev._interpreter);
          }
        }
      }

      if (Array.isArray($gameMap._commonEvents)) {
        for (const ce of $gameMap._commonEvents) {
          if (ce && ce._interpreter) {
            candidates.push(ce._interpreter);
          }
        }
      }
    }

    if (window.$gameTroop && $gameTroop._interpreter) {
      candidates.push($gameTroop._interpreter);
    }

    // Helper to recursively find deepest child interpreter
    const getDeepestChild = (interp) => {
      if (!interp) return null;
      if (interp._childInterpreter) {
        const child = getDeepestChild(interp._childInterpreter);
        return child || interp;
      }
      return interp;
    };

    // Expand candidates to include all child interpreters recursively
    const expandedCandidates = [];
    for (const candidate of candidates) {
      expandedCandidates.push(candidate);
      let child = candidate._childInterpreter;
      while (child) {
        expandedCandidates.push(child);
        child = child._childInterpreter;
      }
    }

    console.log(
      "[findMessageInterpreter] Found candidates:",
      expandedCandidates.length,
      expandedCandidates.map((it) => ({
        isRunning: it && typeof it.isRunning === "function" && it.isRunning(),
        waitMode: it && it._waitMode,
        haslist: it && Array.isArray(it._list),
        listLength: it && it._list && it._list.length,
        index: it && it._index,
      })),
    );

    // First: look for interpreter waiting on message
    const found = expandedCandidates.find(
      (it) =>
        it &&
        typeof it.isRunning === "function" &&
        it.isRunning() &&
        it._waitMode === "message",
    );

    if (found) {
      return found;
    }

    // Fallback: try to find any running interpreter with a list
    const fallback = expandedCandidates.find(
      (it) =>
        it &&
        typeof it.isRunning === "function" &&
        it.isRunning() &&
        it._list &&
        it._list.length > 0,
    );
    if (fallback) {
      console.log(
        "[findMessageInterpreter] Using fallback interpreter (not waiting for message but has list)",
      );
      return fallback;
    }

    return null;
  },

  getInterpreterCurrentMessageEntry(interpreter) {
    if (
      !interpreter ||
      !Array.isArray(interpreter._list) ||
      interpreter._list.length === 0
    ) {
      return null;
    }

    const list = interpreter._list;
    const start = Math.max(
      0,
      Math.min(list.length - 1, Number(interpreter._index) || 0),
    );

    const extractAt = (messageCmdIndex) => {
      if (messageCmdIndex < 0 || messageCmdIndex >= list.length) {
        return null;
      }
      const cmd = list[messageCmdIndex];
      if (!cmd || cmd.code !== 101) {
        return null;
      }

      const speaker = (cmd.parameters && cmd.parameters[4]) || "";
      const lines = [];
      let j = messageCmdIndex + 1;
      while (j < list.length && list[j] && list[j].code === 401) {
        lines.push(list[j].parameters && list[j].parameters[0]);
        j++;
      }

      if (lines.length === 0) {
        return null;
      }

      return {
        text: lines.join("\n"),
        speaker,
      };
    };

    for (let i = start; i >= 0; i--) {
      const found = extractAt(i);
      if (found) {
        return found;
      }
    }

    for (let i = start + 1; i < list.length; i++) {
      const found = extractAt(i);
      if (found) {
        return found;
      }
    }

    return null;
  },

  resolveOriginalMessageContext(currentText, currentSpeaker, interpreter) {
    let resolvedText = currentText || "";
    let resolvedSpeaker = currentSpeaker || "";

    if (window.$gameMessage) {
      if (
        typeof $gameMessage._translateOriginalText === "string" &&
        $gameMessage._translateOriginalText.length > 0
      ) {
        resolvedText = $gameMessage._translateOriginalText;
      }
      if (
        typeof $gameMessage._translateOriginalSpeaker === "string" &&
        $gameMessage._translateOriginalSpeaker.length > 0
      ) {
        resolvedSpeaker = $gameMessage._translateOriginalSpeaker;
      }
    }

    const entry = this.getInterpreterCurrentMessageEntry(interpreter);
    if (entry) {
      const displayedText =
        window.$gameMessage && typeof $gameMessage.allText === "function"
          ? $gameMessage.allText() || ""
          : "";
      const seemsDisplayedText = !!(
        resolvedText &&
        displayedText &&
        resolvedText === displayedText
      );

      if (!resolvedText || seemsDisplayedText) {
        resolvedText = entry.text || resolvedText;
      }
      if (!resolvedSpeaker) {
        resolvedSpeaker = entry.speaker || resolvedSpeaker;
      }
    }

    return {
      text: resolvedText || "",
      speaker: resolvedSpeaker || "",
    };
  },

  collectAheadItems(currentText, currentSpeaker, interpreter, options = {}) {
    const charLimit = options.charLimit || this.charLimit;
    const maxItems = options.maxItems || this.batchItemsLimit || 20;
    const maxDepth = options.maxDepth !== undefined ? options.maxDepth : 999;

    console.log("[Lookahead] Starting collection", {
      charLimit,
      maxItems,
      maxDepth,
      currentText,
      currentSpeaker,
    });

    const NL = "\n";
    const items = []; // Unified list: { type: 'text'|'speaker'|'choice', id: string, value: string }
    let totalChars = 0;
    let itemIdCounter = 0;
    let stopReason = "";
    const seenCacheKeys = new Set();

    const pushItem = (type, value, force = false) => {
      // Skip empty strings, null, undefined (but continue scanning)
      if (value == null || typeof value !== "string" || value.trim() === "") {
        return true; // Skip empty, continue
      }

      // Check cache first - skip cached items (don't add to translation)
      const cacheKey = this.getCacheKey(value, type);
      if (!force && this.hasUsableCacheValue(cacheKey)) {
        return true; // Skip cached, continue
      }

      // Avoid duplicates in one batch
      if (seenCacheKeys.has(cacheKey)) {
        return true; // Skip cached, continue
      }

      if (!force && items.length >= maxItems) {
        stopReason = "items limit reached";
        return false;
      }

      if (!force && totalChars + value.length > charLimit) {
        stopReason = "charLimit reached";
        return false;
      }

      const id = `${type}_${itemIdCounter++}`;
      items.push({ type, id, value, cacheKey });
      totalChars += value.length;
      seenCacheKeys.add(cacheKey);

      return true; // Continue
    };

    // Always include current text and speaker first (forced)
    if (currentText) pushItem("text", currentText, true);
    if (currentSpeaker) pushItem("speaker", currentSpeaker, true);

    // If maxDepth is 0, only return current message
    if (maxDepth === 0 || !interpreter || !Array.isArray(interpreter._list)) {
      console.log("[Lookahead] Stopped: early return", {
        reason:
          maxDepth === 0
            ? "maxDepth is 0"
            : !interpreter
              ? "no interpreter"
              : "interpreter._list not array",
        maxDepth,
        hasInterpreter: !!interpreter,
        isListArray: interpreter && Array.isArray(interpreter._list),
        totalItems: items.length,
      });
      return items;
    }

    const list = interpreter._list;
    const entries = [];
    for (let i = 0; i < list.length; i++) {
      const cmd = list[i];
      if (!cmd || typeof cmd.code !== "number") {
        continue;
      }

      if (cmd.code === 101) {
        const speaker = (cmd.parameters && cmd.parameters[4]) || "";
        const lines = [];
        let j = i + 1;
        while (j < list.length && list[j] && list[j].code === 401) {
          lines.push(list[j].parameters && list[j].parameters[0]);
          j++;
        }

        const joined = lines.join(NL);
        entries.push({ cmdIndex: i, type: "text", value: joined });
        if (speaker) {
          entries.push({ cmdIndex: i, type: "speaker", value: speaker });
        }
        i = j - 1;
        continue;
      }

      if (cmd.code === 102) {
        const choices = cmd.parameters && cmd.parameters[0];
        if (Array.isArray(choices)) {
          for (const choice of choices) {
            entries.push({ cmdIndex: i, type: "choice", value: choice });
          }
        }
      }
    }

    if (!entries.length) {
      return items;
    }

    const startCmdIndex = Math.max(0, Number(interpreter._index) || 0);
    let pivot = entries.findIndex(
      (e) =>
        e.cmdIndex >= startCmdIndex &&
        e.type === "text" &&
        e.value === currentText,
    );
    if (pivot < 0) {
      pivot = entries.findIndex(
        (e) => e.type === "text" && e.value === currentText,
      );
    }
    if (pivot < 0) {
      pivot = entries.findIndex((e) => e.cmdIndex >= startCmdIndex);
    }
    if (pivot < 0) {
      pivot = 0;
    }

    for (let k = 0; k < entries.length; k++) {
      const idx = (pivot + k) % entries.length;
      const entry = entries[idx];
      if (!pushItem(entry.type, entry.value)) {
        break;
      }
    }

    // Log completion info
    console.log("[Lookahead] Scan completed", {
      totalCandidates: entries.length,
      listLength: list.length,
      totalItems: items.length,
      totalChars,
      reason: stopReason || "loop ended",
    });

    return items;
  },

  async startAheadTranslation({
    currentText,
    currentSpeakerName,
    cacheKey,
    maxDepth,
  }) {
    let pendingKeys = null;
    try {
      const interpreter = this.findMessageInterpreter();
      const normalized = this.resolveOriginalMessageContext(
        currentText,
        currentSpeakerName,
        interpreter,
      );
      const normalizedCurrentText = normalized.text || currentText || "";
      const normalizedCurrentSpeaker =
        normalized.speaker || currentSpeakerName || "";

      const items = this.collectAheadItems(
        normalizedCurrentText,
        normalizedCurrentSpeaker,
        interpreter,
        {
          charLimit: Number.MAX_SAFE_INTEGER,
          maxItems: Number.MAX_SAFE_INTEGER,
          maxDepth,
        },
      );

      // Add current choices from $gameMessage if present
      if ($gameMessage && $gameMessage.isChoice && $gameMessage.isChoice()) {
        const currentChoices =
          $gameMessage._translateOriginalChoices || $gameMessage.choices();
        if (Array.isArray(currentChoices)) {
          for (let i = 0; i < currentChoices.length; i++) {
            const choice = currentChoices[i];
            const choiceCacheKey = this.getCacheKey(choice, "choice");
            if (!this.hasUsableCacheValue(choiceCacheKey)) {
              if (!items.some((item) => item.cacheKey === choiceCacheKey)) {
                items.push({
                  type: "choice",
                  id: `current_choice_${i}`,
                  value: choice,
                  cacheKey: choiceCacheKey,
                  mandatory: true,
                });
              }
            }
          }
        }
      }

      if (!items.length) {
        return;
      }

      const mandatoryCacheKeys = new Set();
      if (normalizedCurrentText) {
        mandatoryCacheKeys.add(this.getCacheKey(normalizedCurrentText, "text"));
      }
      if (normalizedCurrentSpeaker) {
        mandatoryCacheKeys.add(
          this.getCacheKey(normalizedCurrentSpeaker, "speaker"),
        );
      }
      if ($gameMessage && $gameMessage.isChoice && $gameMessage.isChoice()) {
        const currentChoices =
          $gameMessage._translateOriginalChoices || $gameMessage.choices();
        if (Array.isArray(currentChoices)) {
          for (const choice of currentChoices) {
            mandatoryCacheKeys.add(this.getCacheKey(choice, "choice"));
          }
        }
      }

      // Filter out items already in cache
      const uncached = items.filter((item) => {
        if (!item || !item.cacheKey) {
          return false;
        }

        if (this.hasUsableCacheValue(item.cacheKey)) {
          return false;
        }

        // Do not endlessly requeue failed lookahead-only items.
        if (
          this.failedTranslations.has(item.cacheKey) &&
          !item.mandatory &&
          !mandatoryCacheKeys.has(item.cacheKey)
        ) {
          return false;
        }

        return true;
      });

      if (uncached.length === 0) {
        // All items cached, apply current text immediately
        const firstTextItem = items.find((item) => item.type === "text");
        if (firstTextItem) {
          const cached = this.translationCache.get(firstTextItem.cacheKey);
          if (cached) {
            this.replaceMessageText(cached);
            this._translationApplied = true;
          }
        }
        return;
      }

      // Deduplicate by cacheKey - only send unique items to translator
      const uniqueMap = new Map();
      for (const item of uncached) {
        if (!uniqueMap.has(item.cacheKey)) {
          uniqueMap.set(item.cacheKey, item);
        }
      }
      const uniqueItemsRaw = Array.from(uniqueMap.values());

      const mandatoryItems = [];
      const optionalItems = [];
      for (const item of uniqueItemsRaw) {
        if (item.mandatory || mandatoryCacheKeys.has(item.cacheKey)) {
          mandatoryItems.push(item);
        } else {
          optionalItems.push(item);
        }
      }

      const uniqueItems = [...mandatoryItems, ...optionalItems];

      // Mark as pending (all uncached, including duplicates)
      pendingKeys = new Set();
      for (const item of uniqueItems) {
        this.pendingTranslations.set(item.cacheKey, true);
        pendingKeys.add(item.cacheKey);
      }

      console.log(
        `[TranslateOnTheFly] Batch translating ${uniqueItems.length} items (${uniqueItems.filter((i) => i.type === "text").length} texts, ${uniqueItems.filter((i) => i.type === "speaker").length} speakers, ${uniqueItems.filter((i) => i.type === "choice").length} choices)`,
      );

      // Batch translate via unified batch manager to keep OTF progress UI consistent
      if (!this.batchManager) {
        this.batchManager = new TranslationBatchManager(this);
      }
      const result = await this.batchManager.runBatchedTranslation(
        uniqueItems,
        {
          stepLabel: "OTF - translating event",
          backgroundJob: false,
          itemLimit: this.batchItemsLimit || 20,
          charLimit: this.charLimit || 1000,
          showSummary: false,
        },
      );

      // Apply successes to cache
      for (const success of result.successes) {
        if (!success || !success.cacheKey) {
          continue;
        }
        this.setCacheValue(success.cacheKey, success.translated);
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

      // Apply the current text (now hopefully cached)
      const firstTextItem = items.find((item) => item.type === "text");
      if (firstTextItem) {
        const translated = this.translationCache.get(firstTextItem.cacheKey);
        if (translated) {
          this.replaceMessageText(translated);
          this._translationApplied = true;

          this.translationCount += result.successes.filter(
            (s) => s.type === "text",
          ).length;
          this.saveSettings();
        } else {
          // Translation failed, show original
          this.replaceMessageText(normalizedCurrentText || currentText || "");
          this._translationApplied = true;
        }
      }

      // Apply translated choices if present (per-choice cache only)
      if ($gameMessage && $gameMessage.isChoice && $gameMessage.isChoice()) {
        const originalChoices =
          $gameMessage._translateOriginalChoices || $gameMessage.choices();
        const translatedChoices = originalChoices.map((choice) => {
          const choiceCacheKey = this.getCacheKey(choice, "choice");
          return this.translationCache.get(choiceCacheKey) || choice;
        });

        this.replaceChoiceText(translatedChoices);
      }
    } catch (error) {
      console.error("[TranslateOnTheFly] Ahead translation error:", error);
      if (pendingKeys) {
        for (const key of pendingKeys) {
          this.failedTranslations.set(key, Date.now());
        }
      }
      this.replaceMessageText(currentText || "");
      this._translationApplied = true;
    } finally {
      // Clear pending flags
      if (pendingKeys) {
        for (const key of pendingKeys) {
          this.pendingTranslations.delete(key);
        }
      }
    }
  },
};
