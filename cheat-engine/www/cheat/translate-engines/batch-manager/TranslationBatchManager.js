import { BatchChunker } from "./BatchChunker.js";
import { ErrorRecoveryStrategy } from "./ErrorRecoveryStrategy.js";
import { BatchProgressTracker } from "./BatchProgressTracker.js";
import { BatchSummaryReporter } from "./BatchSummaryReporter.js";

export class TranslationBatchManager {
  constructor(panel) {
    this.panel = panel;
    this.errorRecovery = new ErrorRecoveryStrategy("default");
    this.progressTracker = new BatchProgressTracker(panel);
  }

  onBatchPausedByOtf(reason = "translating event") {
    this.progressTracker.pause(reason);
  }

  onBatchResumed(stepLabel = null) {
    this.progressTracker.resume(stepLabel);
  }

  isAbortBatchResult(failures, batchSize) {
    if (!Array.isArray(failures) || failures.length !== batchSize) {
      return false;
    }

    return failures.every((failure) => {
      const reason = failure && failure.cancelReason;
      return reason === "background_preempted" || reason === "request_aborted";
    });
  }

  async runBatchedTranslation(items, options = {}) {
    const safeItems = Array.isArray(items) ? items : [];
    const stepLabel = options.stepLabel || "translating batch";
    const backgroundJob = !!options.backgroundJob;
    // isPhase: true  => called as a phase within an active queue;
    //   uses beginPhase() instead of start(), skips complete() at the end,
    //   never shows a per-phase summary regardless of showSummary.
    const isPhase = !!options.isPhase;
    const showSummary = !isPhase && options.showSummary !== false;
    const onBatchSettled =
      typeof options.onBatchSettled === "function"
        ? options.onBatchSettled
        : null;
    const startedAt = Date.now();

    this.errorRecovery.reset(stepLabel);

    if (safeItems.length === 0) {
      const emptySummary = BatchSummaryReporter.buildSummary({
        batchLabel: stepLabel,
        totalItems: 0,
        successes: 0,
        failures: 0,
        errorStats: this.errorRecovery.getStats(),
        durationMs: Date.now() - startedAt,
      });
      if (showSummary) {
        BatchSummaryReporter.showAlert(emptySummary);
        BatchSummaryReporter.logSummary(emptySummary);
      }
      return { successes: [], failures: [], summary: emptySummary };
    }

    const batches = BatchChunker.chunkItems(safeItems, {
      itemLimit: options.itemLimit,
      charLimit: options.charLimit,
    });

    if (isPhase) {
      this.progressTracker.beginPhase(stepLabel, safeItems.length);
    } else {
      this.progressTracker.start(stepLabel, safeItems.length);
    }

    const allSuccesses = [];
    const allFailures = [];
    let processed = 0;

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        this.progressTracker.updateStep(stepLabel, processed, safeItems.length);

        let successes = [];
        let failures = [];

        try {
          const result = backgroundJob
            ? await this.panel.batchTranslateWithBackgroundRetry(
                batch,
                stepLabel,
              )
            : await this.panel.engine.batchTranslate(batch, {
                backgroundJob: false,
              });

          successes = Array.isArray(result && result.successes)
            ? result.successes
            : [];
          failures = Array.isArray(result && result.failures)
            ? result.failures
            : [];
        } catch (error) {
          const rejectReason =
            (error && error.message) || "batch_translate_exception";
          failures = batch.map((item) => ({
            ...item,
            rejectReason,
          }));
        }

        for (const success of successes) {
          allSuccesses.push(success);
          if (
            success &&
            success.cacheKey &&
            (success.recovered === true || success.recoveryUsed === true)
          ) {
            this.errorRecovery.recordRecovery(success.cacheKey);
          }
        }

        for (const failure of failures) {
          allFailures.push(failure);
          this.errorRecovery.recordFailure(failure);
        }

        if (onBatchSettled) {
          await onBatchSettled({
            successes,
            failures,
            batchIndex: i,
            batchSize: batch.length,
            processed,
            total: safeItems.length,
          });
        }

        if (this.isAbortBatchResult(failures, batch.length)) {
          const cancelReason = failures[0] && failures[0].cancelReason;
          for (let r = i + 1; r < batches.length; r++) {
            for (const skippedItem of batches[r]) {
              const skippedFailure = {
                ...skippedItem,
                rejectReason: cancelReason || "request_aborted",
                cancelReason: cancelReason || "request_aborted",
              };
              allFailures.push(skippedFailure);
              this.errorRecovery.recordFailure(skippedFailure);
            }
          }

          processed = safeItems.length;
          this.progressTracker.updateStep(
            `${stepLabel} (aborted)`,
            processed,
            safeItems.length,
          );
          this.progressTracker.updateCurrentStepErrors(
            failures.length,
            batch.length,
          );
          this.progressTracker.updateTotalErrors(allFailures.length);
          break;
        }

        processed += batch.length;
        this.progressTracker.updateStep(stepLabel, processed, safeItems.length);
        this.progressTracker.updateCurrentStepErrors(
          failures.length,
          batch.length,
        );
        this.progressTracker.updateTotalErrors(allFailures.length);
      }
    } finally {
      // Only a standalone (non-phase) call owns the spinner lifecycle.
      if (!isPhase) {
        this.progressTracker.complete();
      }
    }

    const summary = BatchSummaryReporter.buildSummary({
      batchLabel: stepLabel,
      totalItems: safeItems.length,
      successes: allSuccesses.length,
      failures: allFailures.length,
      errorStats: this.errorRecovery.getStats(),
      durationMs: Date.now() - startedAt,
    });
    const stats = this.errorRecovery.getStats();

    if (showSummary) {
      BatchSummaryReporter.showAlert(summary);
      BatchSummaryReporter.logSummary(summary);
    }

    return { successes: allSuccesses, failures: allFailures, summary, stats };
  }

  async translateSystemCommandsBatch(
    backgroundJob = false,
    showSummary = false,
    options = {},
  ) {
    if (
      !(
        window.$dataSystem &&
        $dataSystem.terms &&
        Array.isArray($dataSystem.terms.commands)
      )
    ) {
      return { successes: 0, failures: 0, summary: null, stats: null };
    }

    const hasCommandsOriginal = !!$dataSystem.terms.commandsOriginal;
    const sourceCommands = hasCommandsOriginal
      ? $dataSystem.terms.commandsOriginal
      : $dataSystem.terms.commands;
    if (!hasCommandsOriginal) {
      $dataSystem.terms.commandsOriginal = [...$dataSystem.terms.commands];
    }

    const pending = [];
    for (let i = 0; i < sourceCommands.length; i++) {
      const val = sourceCommands[i];
      if (!val || typeof val !== "string" || val.trim() === "") {
        continue;
      }

      const cacheKey = this.panel.getCacheKey(val, "command");
      if (!this.panel.hasUsableCacheValue(cacheKey)) {
        pending.push({
          type: "system_command",
          id: `cmd_${i}`,
          value: val,
          cacheKey,
          index: i,
        });
      }
    }

    const translated = await this.runBatchedTranslation(
      pending.map((item) => ({
        type: item.type,
        id: item.id,
        value: item.value,
        cacheKey: item.cacheKey,
      })),
      {
        stepLabel: "translating system commands",
        backgroundJob,
        itemLimit: this.panel.batchItemsLimit || 20,
        charLimit: this.panel.charLimit || 1000,
        isPhase: !!options.isPhase,
        showSummary,
        onBatchSettled: ({ successes, failures }) => {
          for (const success of successes || []) {
            if (!success || !success.cacheKey) {
              continue;
            }

            this.panel.setCacheValue(success.cacheKey, success.translated);
            const origin = pending.find(
              (item) => item.cacheKey === success.cacheKey,
            );
            if (
              origin &&
              $dataSystem.terms.commands[origin.index] !== undefined
            ) {
              $dataSystem.terms.commands[origin.index] = success.translated;
            }
          }

          this.panel.markBatchFailuresAsUntranslated(failures || [], true);
        },
      },
    );

    return {
      successes: translated.successes.length,
      failures: translated.failures.length,
      summary: translated.summary,
      stats: translated.stats,
    };
  }

  async translateSystemMessagesBatch(
    backgroundJob = false,
    showSummary = false,
    options = {},
  ) {
    if (
      !(
        window.$dataSystem &&
        $dataSystem.terms &&
        $dataSystem.terms.messages &&
        typeof $dataSystem.terms.messages === "object"
      )
    ) {
      return { successes: 0, failures: 0, summary: null, stats: null };
    }

    const hasMessagesOriginal = !!$dataSystem.terms.messagesOriginal;
    const sourceMessages = hasMessagesOriginal
      ? $dataSystem.terms.messagesOriginal
      : $dataSystem.terms.messages;
    if (!hasMessagesOriginal) {
      $dataSystem.terms.messagesOriginal = Object.assign(
        {},
        $dataSystem.terms.messages || {},
      );
    }

    const pending = [];
    for (const key of Object.keys(sourceMessages || {})) {
      const val = sourceMessages[key];
      if (typeof val !== "string" || val.trim() === "") {
        continue;
      }

      if (!this.panel.hasUsableCacheValue(key)) {
        pending.push({
          type: "system_message",
          id: `msg_${key}`,
          value: val,
          cacheKey: key,
        });
      }
    }

    const translated = await this.runBatchedTranslation(
      pending.map((item) => ({
        type: item.type,
        id: item.id,
        value: item.value,
        cacheKey: item.cacheKey,
      })),
      {
        stepLabel: "translating system messages",
        backgroundJob,
        itemLimit: this.panel.batchItemsLimit || 20,
        charLimit: this.panel.charLimit || 1000,
        isPhase: !!options.isPhase,
        showSummary,
        onBatchSettled: ({ successes, failures }) => {
          for (const success of successes || []) {
            if (!success || !success.cacheKey) {
              continue;
            }

            this.panel.setCacheValue(success.cacheKey, success.translated);
            if (
              $dataSystem.terms.messages &&
              Object.prototype.hasOwnProperty.call(
                $dataSystem.terms.messages,
                success.cacheKey,
              )
            ) {
              $dataSystem.terms.messages[success.cacheKey] = success.translated;
            }
          }

          this.panel.markBatchFailuresAsUntranslated(failures || [], true);
        },
      },
    );

    return {
      successes: translated.successes.length,
      failures: translated.failures.length,
      summary: translated.summary,
      stats: translated.stats,
    };
  }

  async translateDataBatch(dataObjects, fields, type, options = {}) {
    if (!Array.isArray(dataObjects) || !Array.isArray(fields) || !type) {
      return { successes: 0, failures: 0 };
    }

    const items = [];
    for (const dataObject of dataObjects) {
      if (!dataObject) {
        continue;
      }

      if (!dataObject._translateOriginal) {
        dataObject._translateOriginal = {};
      }

      for (const field of fields) {
        const value = dataObject[field];
        if (typeof value !== "string" || value.trim() === "") {
          continue;
        }

        if (!(field in dataObject._translateOriginal)) {
          dataObject._translateOriginal[field] = value;
        }

        const originalValue = dataObject._translateOriginal[field];
        const cacheKey = this.panel.getCacheKey(
          originalValue,
          `${type}_${field}`,
        );
        if (this.panel.hasUsableCacheValue(cacheKey)) {
          continue;
        }

        items.push({
          type: `${type}_${field}`,
          id: `${type}_${dataObject.id}_${field}`,
          value: originalValue,
          cacheKey,
          dataObject,
          field,
        });
      }
    }

    const translated = await this.runBatchedTranslation(
      items.map((item) => ({
        type: item.type,
        id: item.id,
        value: item.value,
        cacheKey: item.cacheKey,
      })),
      {
        stepLabel: `translating ${type}`,
        backgroundJob: !!options.backgroundJob,
        itemLimit: this.panel.batchItemsLimit || 20,
        charLimit: this.panel.charLimit || 1000,
        isPhase: !!options.isPhase,
        showSummary: false,
        onBatchSettled: ({ successes, failures }) => {
          for (const success of successes || []) {
            if (success && success.cacheKey) {
              this.panel.setCacheValue(success.cacheKey, success.translated);
            }
          }

          this.panel.markBatchFailuresAsUntranslated(failures || [], true);
        },
      },
    );

    for (const dataObject of dataObjects) {
      if (!dataObject || !dataObject._translateOriginal) {
        continue;
      }

      for (const field of fields) {
        const originalValue = dataObject._translateOriginal[field];
        if (typeof originalValue !== "string" || originalValue.trim() === "") {
          continue;
        }

        const cacheKey = this.panel.getCacheKey(
          originalValue,
          `${type}_${field}`,
        );
        if (this.panel.hasUsableCacheValue(cacheKey)) {
          dataObject[field] = this.panel.translationCache.get(cacheKey);
        }
      }
    }

    return {
      successes: translated.successes.length,
      failures: translated.failures.length,
      stats: translated.stats,
    };
  }

  async translateMapEvents(
    mapData = null,
    mapNumber = null,
    totalMaps = null,
    progressLabel = null,
    options = {},
  ) {
    const dataMap = mapData || window.$dataMap;
    if (!dataMap) {
      return { successCount: 0, failureCount: 0 };
    }

    const events = dataMap.events;
    if (!Array.isArray(events)) {
      return { successCount: 0, failureCount: 0 };
    }

    const itemsToTranslate = [];
    let runningCounter = 0;

    const pushMapTextItem = (rawText, eventIdx, pageIdx, cmdIdx) => {
      if (typeof rawText !== "string" || rawText.trim() === "") {
        return;
      }

      const cacheKey = this.panel.getCacheKey(rawText, "text");
      if (this.panel.hasUsableCacheValue(cacheKey)) {
        return;
      }

      itemsToTranslate.push({
        type: "text",
        id: `map_${eventIdx}_${pageIdx}_text_${runningCounter++}`,
        value: rawText,
        cacheKey,
        eventIdx,
        pageIdx,
        cmdIdx,
      });
    };

    for (let eventIdx = 0; eventIdx < events.length; eventIdx++) {
      const event = events[eventIdx];
      if (!event || !Array.isArray(event.pages)) {
        continue;
      }

      for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
        const page = event.pages[pageIdx];
        if (!page || !Array.isArray(page.list)) {
          continue;
        }

        const list = page.list;
        let i = 0;
        while (i < list.length) {
          const cmd = list[i];
          if (!cmd || typeof cmd.code !== "number") {
            i += 1;
            continue;
          }

          if (cmd.code === 101) {
            const speaker = (cmd.parameters && cmd.parameters[4]) || "";
            const lines = [];
            let j = i + 1;
            while (j < list.length && list[j] && list[j].code === 401) {
              lines.push(list[j].parameters && list[j].parameters[0]);
              j += 1;
            }

            pushMapTextItem(lines.join("\n"), eventIdx, pageIdx, i);

            if (speaker) {
              const speakerKey = this.panel.getCacheKey(speaker, "speaker");
              if (!this.panel.hasUsableCacheValue(speakerKey)) {
                itemsToTranslate.push({
                  type: "speaker",
                  id: `map_${eventIdx}_${pageIdx}_speaker_${runningCounter++}`,
                  value: speaker,
                  cacheKey: speakerKey,
                  eventIdx,
                  pageIdx,
                  cmdIdx: i,
                });
              }
            }

            i = j;
            continue;
          }

          if (cmd.code === 102) {
            const choices = cmd.parameters && cmd.parameters[0];
            if (Array.isArray(choices)) {
              for (const choice of choices) {
                const choiceKey = this.panel.getCacheKey(choice, "choice");
                if (!this.panel.hasUsableCacheValue(choiceKey)) {
                  itemsToTranslate.push({
                    type: "choice",
                    id: `map_${eventIdx}_${pageIdx}_choice_${runningCounter++}`,
                    value: choice,
                    cacheKey: choiceKey,
                    eventIdx,
                    pageIdx,
                    cmdIdx: i,
                  });
                }
              }
            }
          }

          i += 1;
        }
      }
    }

    const uniqueItems = Array.from(
      new Map(itemsToTranslate.map((item) => [item.cacheKey, item])).values(),
    );
    const stepLabel =
      progressLabel ||
      (mapNumber !== null && totalMaps !== null
        ? `translating map ${mapNumber}/${totalMaps}`
        : "translating map");

    const translated = await this.runBatchedTranslation(
      uniqueItems.map((item) => ({
        type: item.type,
        id: item.id,
        value: item.value,
        cacheKey: item.cacheKey,
      })),
      {
        stepLabel,
        backgroundJob: !!(options && options.backgroundJob),
        itemLimit: this.panel.batchItemsLimit || 20,
        charLimit: this.panel.charLimit || 1000,
        isPhase: !!(options && options.isPhase),
        showSummary: !options.isPhase && mapNumber === null,
        onBatchSettled: ({ successes, failures }) => {
          for (const success of successes || []) {
            if (success && success.cacheKey) {
              this.panel.setCacheValue(success.cacheKey, success.translated);
            }
          }

          this.panel.markBatchFailuresAsUntranslated(failures || [], true);
        },
      },
    );

    return {
      successCount: translated.successes.length,
      failureCount: translated.failures.length,
      totalCount: uniqueItems.length,
      stats: translated.stats,
    };
  }
}
