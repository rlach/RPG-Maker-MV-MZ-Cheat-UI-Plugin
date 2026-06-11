import { BatchChunker } from './BatchChunker.js';
import { ErrorRecoveryStrategy } from './ErrorRecoveryStrategy.js';
import { BatchProgressTracker } from './BatchProgressTracker.js';
import { BatchSummaryReporter } from './BatchSummaryReporter.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../plugins/PluginTranslatorRegistry.js';

export class TranslationBatchManager {
    constructor(runtime, options = {}) {
        this.runtime = runtime;
        this.progressChannel = options.progressChannel || 'main';
        this.errorRecovery = new ErrorRecoveryStrategy('default');
        const progressUi = options.progressUi || runtime;
        this.progressTracker = new BatchProgressTracker(runtime, progressUi, this.progressChannel);
        this.kindRegistry = new Map();
    }

    register(strategy) {
        this.kindRegistry.set(strategy.getKind(), strategy);
    }

    applyDataOnLifecycle(context = {}) {
        for (const definition of this.kindRegistry.values()) {
            try {
                definition.applyDataOnLifecycle({
                    ...context,
                    manager: this,
                    runtime: this.runtime,
                });
            } catch (error) {
                console.warn(
                    `[TranslationBatchManager] Lifecycle hook applyDataOnLifecycle failed for ${definition.getKind ? definition.getKind() : 'unknown'}`,
                    error
                );
            }
        }
    }

    getKindDefinition(kind) {
        return this.kindRegistry.get(kind) || null;
    }

    onBatchPausedByOtf(reason = 'translating event') {
        this.progressTracker.pause(reason);
    }

    onBatchResumed(translationPhaseLabel = null) {
        this.progressTracker.resume(translationPhaseLabel);
    }

    isAbortBatchResult(failures, batchSize) {
        if (!Array.isArray(failures) || failures.length !== batchSize) {
            return false;
        }

        return failures.every((failure) => {
            const reason = failure && failure.cancelReason;
            return reason === 'background_preempted' || reason === 'request_aborted';
        });
    }

    _notifyPluginKnowledgeBase(successes, failures) {
        if (!Array.isArray(successes) || successes.length === 0) {
            return;
        }

        const translators = PLUGIN_TRANSLATOR_REGISTRY.getDetectedTranslatorInstances();
        for (const translator of translators) {
            try {
                translator.manageKnowledgeBase({}, { successes, failures });
            } catch (error) {
                console.warn(
                    '[TranslationBatchManager] manageKnowledgeBase failed for',
                    translator.getPluginName(),
                    error
                );
            }
        }
    }

    isQueueAbortRequested() {
        return !!(this.runtime && this.runtime.isBatchQueueAbortRequested());
    }

    countBatchRequestedChars(batchItems) {
        if (!Array.isArray(batchItems)) {
            return 0;
        }

        let total = 0;
        for (const item of batchItems) {
            if (!item) {
                continue;
            }

            const value = item?.value;
            if (typeof value === 'string') {
                total += value.length;
            } else if (value !== null && value !== undefined) {
                total += String(value).length;
            }
        }

        return total;
    }

    addCacheTypesFromItems(targetSet, items) {
        if (!(targetSet instanceof Set) || !Array.isArray(items)) {
            return;
        }

        for (const item of items) {
            const type = item && item.type;
            if (!type) {
                continue;
            }

            const normalized = String(type).trim();
            if (normalized) {
                targetSet.add(normalized);
            }
        }
    }

    addCacheTypesFromStrategy(targetSet, strategy, request = null) {
        if (!(targetSet instanceof Set) || !strategy) {
            return;
        }

        {
            const types = strategy.getQueueScopeCacheTypes?.({
                runtime: this.runtime,
                request,
            });
            this.addCacheTypesFromItems(
                targetSet,
                (Array.isArray(types) ? types : []).map((type) => ({ type }))
            );
        }

        {
            const type = strategy.getCacheType?.();
            if (type) {
                targetSet.add(String(type).trim());
            }
        }

        if (typeof strategy.cachePrefix === 'string' && Array.isArray(strategy.fields)) {
            for (const field of strategy.fields) {
                const normalizedField = String(field || '').trim();
                if (!normalizedField) {
                    continue;
                }
                targetSet.add(`${strategy.cachePrefix}_${normalizedField}`);
            }
        }
    }

    addKnownKindCacheTypes(targetSet, kind) {
        if (!(targetSet instanceof Set) || !kind) {
            return;
        }

        if (kind === 'cacheEmptyStrings') {
            targetSet.add('*');
            return;
        }

        if (kind === 'systemMessages') {
            targetSet.add('system_message');
            return;
        }

        if (kind === 'systemCommands') {
            targetSet.add('system_command');
            return;
        }

        if (kind === 'mapEvents') {
            targetSet.add('message');
            return;
        }

        if (kind === 'gameArrays' && this.runtime) {
            const defs = this.runtime.getGameArrayDefs() || [];
            for (const def of defs) {
                const type = def?.type;
                if (!type) {
                    continue;
                }
                targetSet.add(String(type).trim());
            }
        }

        if (kind === 'variables') {
            targetSet.add('variable_value');
            return;
        }

        if (kind === 'koharu') {
            targetSet.add('koharu');
        }
    }

    addCacheTypesFromRequestItems(targetSet, kind, request = {}) {
        if (!(targetSet instanceof Set)) {
            return;
        }

        if ((kind === 'emptyStrings' || kind === 'directItems') && Array.isArray(request.items)) {
            this.addCacheTypesFromItems(targetSet, request.items);
        }
    }

    addCacheTypesFromKindFallback(targetSet, request = {}, definition = null) {
        if (!(targetSet instanceof Set)) {
            return;
        }

        const kind = String(request?.kind || '').trim();
        if (!kind) {
            return;
        }

        const safeDefinition = /** @type {any} */ (definition);
        if (
            safeDefinition &&
            typeof safeDefinition.cachePrefix === 'string' &&
            Array.isArray(safeDefinition.fields)
        ) {
            for (const field of safeDefinition.fields) {
                const normalizedField = String(field || '').trim();
                if (!normalizedField) {
                    continue;
                }
                targetSet.add(`${safeDefinition.cachePrefix}_${normalizedField}`);
            }
        }

        this.addKnownKindCacheTypes(targetSet, kind);
        this.addCacheTypesFromRequestItems(targetSet, kind, request);
    }

    getCurrentMapEntryIndex(queueEntries, currentMapId) {
        if (!Array.isArray(queueEntries)) {
            return -1;
        }

        const mapId = Number(currentMapId) || 0;
        if (mapId <= 0) {
            return -1;
        }

        return queueEntries.findIndex((entry) => entry && Number(entry.priorityMapId) === mapId);
    }

    applyBatchTranslationResults(successes, failures, options = {}) {
        const persist = options.persist === undefined ? true : !!options.persist;
        const changedKeys = [];

        for (const success of successes || []) {
            if (!success || !success.cacheKey) {
                continue;
            }

            this.runtime.setCacheValue(success.cacheKey, success.translated, {
                persist: false,
            });
            changedKeys.push(success.cacheKey);
        }

        const safeFailures = Array.isArray(failures) ? failures : [];
        this.runtime.markBatchFailuresAsUntranslated(safeFailures, true);

        for (const failure of safeFailures) {
            if (!failure || !failure.cacheKey) {
                continue;
            }

            const hasUsable = this.runtime.hasUsableCacheValue(failure.cacheKey);
            if (!hasUsable) {
                this.runtime.setCacheValue(failure.cacheKey, '', { persist: false });
                changedKeys.push(failure.cacheKey);
            }
        }

        if (persist) {
            this.runtime.persistCache(changedKeys);
        }

        return changedKeys;
    }

    createExecutionOptions(request = {}, options = {}) {
        const hasOwn = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);

        return {
            translationPhaseLabel: request.translationPhaseLabel || options.translationPhaseLabel,
            stepLabel: request.stepLabel || options.stepLabel,
            backgroundJob: hasOwn(request, 'backgroundJob')
                ? !!request.backgroundJob
                : hasOwn(options, 'backgroundJob')
                  ? !!options.backgroundJob
                  : true,
            itemLimit: hasOwn(request, 'itemLimit')
                ? request.itemLimit
                : hasOwn(options, 'itemLimit')
                  ? options.itemLimit
                  : this.runtime && this.runtime.batchItemsLimit,
            charLimit: hasOwn(request, 'charLimit')
                ? request.charLimit
                : hasOwn(options, 'charLimit')
                  ? options.charLimit
                  : this.runtime && this.runtime.charLimit,
            dryRun: hasOwn(request, 'dryRun')
                ? !!request.dryRun
                : hasOwn(options, 'dryRun')
                  ? !!options.dryRun
                  : false,
            onTranslationBatchCompleted:
                typeof request.onTranslationBatchCompleted === 'function'
                    ? request.onTranslationBatchCompleted
                    : typeof options.onTranslationBatchCompleted === 'function'
                      ? options.onTranslationBatchCompleted
                      : null,
            boxingMode: hasOwn(request, 'boxingMode')
                ? !!request.boxingMode
                : hasOwn(options, 'boxingMode')
                  ? !!options.boxingMode
                  : false,
            boxingSystemMessage: hasOwn(request, 'boxingSystemMessage')
                ? request.boxingSystemMessage
                : hasOwn(options, 'boxingSystemMessage')
                  ? options.boxingSystemMessage
                  : '',
        };
    }

    async runBatchedTranslation(items, options = {}) {
        if (this.runtime) {
            this.runtime.clearQueueCompletionScope(this.progressChannel);
        }

        const queueEntries = [];
        const queueScopeCacheTypes = new Set();
        if (this.runtime && this.progressChannel === 'main') {
            this.runtime.clearBatchThroughputSamples?.(this.progressChannel);
        }
        const safeRequests = Array.isArray(items) ? items : [];
        const hasOnlyKindRequests = safeRequests.every((item) => {
            return !!(item && typeof item === 'object' && typeof item.kind === 'string');
        });
        if (!hasOnlyKindRequests) {
            throw new Error(
                'runBatchedTranslation expects an array of kind requests: [{ kind, ... }]'
            );
        }

        for (const request of safeRequests) {
            const definition = this.getKindDefinition(request && request.kind);
            if (!definition || typeof definition.createEntries !== 'function') {
                throw new Error(`Unknown translation kind: ${(request && request.kind) || ''}`);
            }

            const entries =
                (await definition.createEntries({
                    request,
                    manager: this,
                    runtime: this.runtime,
                })) || [];
            this.addCacheTypesFromKindFallback(queueScopeCacheTypes, request, definition);
            const executionOptions = this.createExecutionOptions(request, options);
            for (const entry of entries) {
                this.addCacheTypesFromItems(queueScopeCacheTypes, entry?.items);
                if (entry?.strategy) {
                    this.addCacheTypesFromStrategy(queueScopeCacheTypes, entry.strategy, request);
                }

                queueEntries.push({
                    ...entry,
                    kind: request.kind,
                    definition,
                    executionOptions,
                });
            }
        }

        const startedAt = Date.now();
        const aggregatedSuccesses = [];
        const aggregatedFailures = [];
        const aggregatedErrorStats = BatchSummaryReporter.createErrorStatsAccumulator();
        const mergeStats = (stats) => {
            BatchSummaryReporter.mergeErrorStats(aggregatedErrorStats, stats);
        };
        const countQueueRequestedChars = (entries) => {
            let total = 0;

            for (const entry of entries || []) {
                if (!entry) {
                    continue;
                }

                if (Array.isArray(entry.items)) {
                    total += this.countBatchRequestedChars(entry.items);
                    continue;
                }

                const strategy = entry.strategy;
                if (!strategy || typeof strategy.collectUntranslated !== 'function') {
                    continue;
                }

                const pendingItems = strategy.collectUntranslated({
                    runtime: this.runtime,
                });
                const batchItems =
                    typeof strategy.toTranslationBatchItems === 'function'
                        ? strategy.toTranslationBatchItems(pendingItems || [])
                        : pendingItems || [];
                total += this.countBatchRequestedChars(batchItems);
            }

            return total;
        };
        const executeEntry = async (entryItems, entryOptions = {}) => {
            const strategy = entryOptions.strategy;
            const hasStrategy = !!strategy;
            let pendingItems = null;
            if (hasStrategy) {
                if (
                    typeof strategy.getTranslationPhaseLabel !== 'function' ||
                    typeof strategy.collectUntranslated !== 'function' ||
                    typeof strategy.setData !== 'function'
                ) {
                    throw new Error('Invalid translation phase strategy');
                }
                pendingItems =
                    strategy.collectUntranslated({
                        runtime: this.runtime,
                    }) || [];
            }

            const safeItems = hasStrategy
                ? strategy.toTranslationBatchItems
                    ? strategy.toTranslationBatchItems(pendingItems)
                    : (pendingItems || []).map((item) => ({
                          type: item.type,
                          id: item.id,
                          value: item.value,
                          cacheKey: item.cacheKey,
                      }))
                : Array.isArray(entryItems)
                  ? entryItems
                  : [];
            const translationPhaseLabel = hasStrategy
                ? strategy.getTranslationPhaseLabel({
                      runtime: this.runtime,
                  })
                : entryOptions.translationPhaseLabel ||
                  entryOptions.stepLabel ||
                  'translating batch';
            const backgroundJob = !!entryOptions.backgroundJob;
            const dryRun = !!entryOptions.dryRun;
            const onTranslationBatchCompleted =
                typeof entryOptions.onTranslationBatchCompleted === 'function'
                    ? entryOptions.onTranslationBatchCompleted
                    : null;
            const startedAt = Date.now();

            this.errorRecovery.reset(translationPhaseLabel);

            if (safeItems.length === 0) {
                const emptySummary = BatchSummaryReporter.buildSummary({
                    batchLabel: translationPhaseLabel,
                    totalItems: 0,
                    successes: 0,
                    failures: 0,
                    errorStats: this.errorRecovery.getStats(),
                    durationMs: Date.now() - startedAt,
                });
                return {
                    successes: [],
                    failures: [],
                    summary: emptySummary,
                    stats: this.errorRecovery.getStats(),
                };
            }

            const batches = BatchChunker.chunkItems(safeItems, {
                itemLimit: entryOptions.itemLimit,
                charLimit: entryOptions.charLimit,
            });

            this.progressTracker.beginPhase(translationPhaseLabel, safeItems.length);

            const allSuccesses = [];
            const allFailures = [];
            let processed = 0;
            let phaseFailures = 0;
            let interruptedForCurrentMap = false;

            for (let i = 0; i < batches.length; i++) {
                if (this.isQueueAbortRequested()) {
                    const skippedFailures = [];
                    for (let r = i; r < batches.length; r++) {
                        for (const skippedItem of batches[r]) {
                            const skippedFailure = {
                                ...skippedItem,
                                rejectReason: 'request_aborted',
                                cancelReason: 'request_aborted',
                            };
                            allFailures.push(skippedFailure);
                            skippedFailures.push(skippedFailure);
                            this.errorRecovery.recordFailure(skippedFailure);
                        }
                    }

                    if (skippedFailures.length > 0) {
                        this.applyBatchTranslationResults([], skippedFailures);
                        phaseFailures += skippedFailures.length;
                        this.progressTracker.addTotalErrors(skippedFailures.length);
                    }

                    processed = safeItems.length;
                    this.progressTracker.updateStep(
                        `${translationPhaseLabel} (aborted)`,
                        processed,
                        safeItems.length
                    );
                    this.progressTracker.updateCurrentStepErrors(phaseFailures, processed);
                    break;
                }

                if (
                    !!entryOptions.allowCurrentMapMidPhaseSwitch &&
                    typeof entryOptions.shouldInterruptForCurrentMap === 'function' &&
                    entryOptions.shouldInterruptForCurrentMap()
                ) {
                    interruptedForCurrentMap = true;
                    break;
                }

                const batch = batches[i];
                const batchStartedAt = Date.now();
                const batchRequestedChars = this.countBatchRequestedChars(batch);
                this.progressTracker.updateStep(translationPhaseLabel, processed, safeItems.length);

                let successes = [];
                let failures = [];

                try {
                    if (dryRun) {
                        successes = [];
                        failures = batch.map((item) => ({
                            ...item,
                            cacheKey: item.cacheKey,
                            rejectReason: 'dry_run',
                            translated: '',
                        }));
                    } else {
                        const result = backgroundJob
                            ? await this.runtime.batchTranslateWithBackgroundRetry(
                                  batch,
                                  translationPhaseLabel
                              )
                            : await this.runtime.engine.batchTranslate(batch, {
                                  backgroundJob: false,
                                  boxingMode: !!entryOptions.boxingMode,
                                  boxingSystemMessage: entryOptions.boxingSystemMessage || '',
                              });

                        if (result && result.recoveryStrategyUsed === true) {
                            this.errorRecovery.recordRecoveryAttempt(1);
                        }

                        successes = Array.isArray(result && result.successes)
                            ? result.successes
                            : [];
                        failures = Array.isArray(result && result.failures) ? result.failures : [];
                    }
                } catch (error) {
                    const rejectReason =
                        error instanceof Error
                            ? error.message
                            : String(error || 'batch_translate_exception');
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
                    if (failure && failure.recoveryAttempted === true) {
                        this.errorRecovery.recordRecoveryAttempt(1);
                    }
                    this.errorRecovery.recordFailure(failure);
                }

                const changedKeys = this.applyBatchTranslationResults(successes, failures, {
                    persist: false,
                });

                if (!dryRun && changedKeys.length > 0) {
                    this.runtime.persistCache(changedKeys);
                }

                phaseFailures += failures.length;

                if (onTranslationBatchCompleted) {
                    await onTranslationBatchCompleted({
                        successes,
                        failures,
                        batchIndex: i,
                        batchSize: batch.length,
                        processed,
                        total: safeItems.length,
                    });
                }

                if (hasStrategy) {
                    await strategy.setData({
                        runtime: this.runtime,
                        pendingItems,
                        successes,
                        failures,
                        batchMeta: {
                            batchIndex: i,
                            batchSize: batch.length,
                            processed,
                            total: safeItems.length,
                        },
                        options: entryOptions,
                    });
                }

                // Let all detected plugin translators inspect batch results for knowledge extraction
                this._notifyPluginKnowledgeBase(successes, failures);

                if (!dryRun && this.runtime && !this.isAbortBatchResult(failures, batch.length)) {
                    this.runtime.recordBatchThroughputSample(
                        batchRequestedChars,
                        Date.now() - batchStartedAt,
                        this.progressChannel
                    );
                }

                if (this.isAbortBatchResult(failures, batch.length)) {
                    const cancelReason = failures[0] && failures[0].cancelReason;
                    const skippedFailures = [];
                    let skippedFailuresCount = 0;
                    for (let r = i + 1; r < batches.length; r++) {
                        for (const skippedItem of batches[r]) {
                            const skippedFailure = {
                                ...skippedItem,
                                rejectReason: cancelReason || 'request_aborted',
                                cancelReason: cancelReason || 'request_aborted',
                            };
                            allFailures.push(skippedFailure);
                            skippedFailures.push(skippedFailure);
                            this.errorRecovery.recordFailure(skippedFailure);
                            skippedFailuresCount += 1;
                        }
                    }

                    if (skippedFailures.length > 0) {
                        this.applyBatchTranslationResults([], skippedFailures);
                    }

                    phaseFailures += skippedFailuresCount;

                    processed = safeItems.length;
                    this.progressTracker.updateStep(
                        `${translationPhaseLabel} (aborted)`,
                        processed,
                        safeItems.length
                    );
                    this.progressTracker.updateCurrentStepErrors(phaseFailures, processed);
                    this.progressTracker.addTotalErrors(failures.length + skippedFailuresCount);
                    break;
                }

                this.runtime?.markQueueCompletionItemsProcessed?.(batch, this.progressChannel);

                processed += batch.length;
                this.progressTracker.updateStep(translationPhaseLabel, processed, safeItems.length);
                this.progressTracker.updateCurrentStepErrors(phaseFailures, processed);
                this.progressTracker.addTotalErrors(failures.length);
            }

            const summary = BatchSummaryReporter.buildSummary({
                batchLabel: translationPhaseLabel,
                totalItems: safeItems.length,
                successes: allSuccesses.length,
                failures: allFailures.length,
                errorStats: this.errorRecovery.getStats(),
                durationMs: Date.now() - startedAt,
            });
            const stats = this.errorRecovery.getStats();

            if (!interruptedForCurrentMap && hasStrategy) {
                strategy.finalizePhase?.({
                    runtime: this.runtime,
                    pendingItems,
                });
            }

            return {
                successes: allSuccesses,
                failures: allFailures,
                summary,
                stats,
                interruptedForCurrentMap,
            };
        };

        const safeQueueEntries = [...queueEntries];
        const dryRun = !!options.dryRun;

        if (dryRun && this.runtime) {
            this.runtime.markDryRunExecuted();
        }

        if (safeQueueEntries.length === 0) {
            const emptySummary = BatchSummaryReporter.buildSummary({
                batchLabel: options.translationPhaseLabel || 'translation',
                totalItems: 0,
                successes: 0,
                failures: 0,
                errorStats: aggregatedErrorStats,
                durationMs: Date.now() - startedAt,
            });
            return {
                successes: [],
                failures: [],
                summary: emptySummary,
                stats: aggregatedErrorStats,
            };
        }

        if (this.runtime) {
            this.runtime.startQueueCompletionScope(
                Array.from(queueScopeCacheTypes),
                countQueueRequestedChars(queueEntries),
                this.progressChannel
            );
        }

        this.progressTracker.beginQueue();
        try {
            while (safeQueueEntries.length > 0) {
                if (this.isQueueAbortRequested()) {
                    break;
                }

                const currentMapId = this.runtime.getCurrentMapIdForPhasePriority();
                if (currentMapId > 0) {
                    const currentMapEntryIndex = this.getCurrentMapEntryIndex(
                        safeQueueEntries,
                        currentMapId
                    );
                    if (currentMapEntryIndex > 0) {
                        const [entry] = safeQueueEntries.splice(currentMapEntryIndex, 1);
                        safeQueueEntries.unshift(entry);
                    }
                }

                const entry = safeQueueEntries[0];
                if (!entry) {
                    continue;
                }

                const allowCurrentMapMidPhaseSwitch = !!(
                    this.runtime && this.runtime.changeToCurrentMapInMassTranslationMidPhase
                );

                let translated;
                if (typeof entry.execute === 'function') {
                    translated = await entry.execute({
                        runtime: this.runtime,
                        executionOptions: entry.executionOptions || {},
                    });
                } else {
                    const strategy =
                        typeof entry.createStrategy === 'function'
                            ? await entry.createStrategy()
                            : entry.strategy;
                    translated = await executeEntry(entry.items || [], {
                        ...(entry.executionOptions || {}),
                        strategy,
                        priorityMapId: Number(entry.priorityMapId) || 0,
                        allowCurrentMapMidPhaseSwitch,
                        shouldInterruptForCurrentMap: () => {
                            if (!allowCurrentMapMidPhaseSwitch) {
                                return false;
                            }

                            const freshCurrentMapId =
                                this.runtime.getCurrentMapIdForPhasePriority();
                            const freshCurrentMapEntryIndex = this.getCurrentMapEntryIndex(
                                safeQueueEntries,
                                freshCurrentMapId
                            );
                            return freshCurrentMapEntryIndex > 0;
                        },
                    });
                }

                for (const success of translated.successes || []) {
                    aggregatedSuccesses.push(success);
                }
                for (const failure of translated.failures || []) {
                    aggregatedFailures.push(failure);
                }
                mergeStats(translated.stats);

                if (this.isQueueAbortRequested()) {
                    break;
                }

                if (translated && translated.interruptedForCurrentMap) {
                    continue;
                }

                if (
                    typeof entry.shouldRepeat === 'function' &&
                    entry.shouldRepeat(translated, {
                        runtime: this.runtime,
                        executionOptions: entry.executionOptions || {},
                    })
                ) {
                    continue;
                }

                safeQueueEntries.shift();
            }
        } finally {
            this.progressTracker.endQueue();
            if (this.runtime) {
                this.runtime.clearQueueCompletionScope(this.progressChannel);
            }
        }

        if (dryRun && (aggregatedSuccesses.length > 0 || aggregatedFailures.length > 0)) {
            const changedKeys = this.applyBatchTranslationResults(
                aggregatedSuccesses,
                aggregatedFailures,
                {
                    persist: false,
                }
            );
            if (changedKeys.length > 0) {
                this.runtime.persistCache(changedKeys);
            }
        }

        const summary = BatchSummaryReporter.buildSummary({
            batchLabel: options.translationPhaseLabel || 'translation',
            totalItems: aggregatedSuccesses.length + aggregatedFailures.length,
            successes: aggregatedSuccesses.length,
            failures: aggregatedFailures.length,
            errorStats: aggregatedErrorStats,
            durationMs: Date.now() - startedAt,
            currentPhaseErrors: 0,
            totalCumulativeErrors: aggregatedFailures.length,
        });

        if (dryRun && aggregatedFailures.length > 0) {
            const changedKeys = this.applyBatchTranslationResults([], aggregatedFailures, {
                persist: false,
            });
            if (changedKeys.length > 0) {
                this.runtime.persistCache(changedKeys);
            }
        }

        const showSummary = options.showSummary !== false;
        if (showSummary) {
            BatchSummaryReporter.showAlert(summary);
            BatchSummaryReporter.logSummary(summary);
        }

        return {
            successes: aggregatedSuccesses,
            failures: aggregatedFailures,
            summary,
            stats: aggregatedErrorStats,
        };
    }

    countAmountSync(requests) {
        const safeRequests = Array.isArray(requests)
            ? requests
            : requests && typeof requests === 'object'
              ? [requests]
              : [];

        const result = [];
        for (const request of safeRequests) {
            const definition = this.getKindDefinition(request && request.kind);
            if (!definition) {
                result.push({
                    kind: request && request.kind,
                    total: 0,
                    left: 0,
                    totalStrings: 0,
                    leftStrings: 0,
                });
                continue;
            }

            const counted =
                definition.countAmountSync?.({
                    request,
                    manager: this,
                    runtime: this.runtime,
                }) || {};
            result.push({
                kind: request && request.kind,
                total: Math.max(0, Number(counted.total) || 0),
                left: Math.max(0, Number(counted.left) || 0),
                totalStrings: Math.max(0, Number(counted.totalStrings) || 0),
                leftStrings: Math.max(0, Number(counted.leftStrings) || 0),
            });
        }

        if (!Array.isArray(requests) && result.length > 0) {
            return result[0];
        }

        return result;
    }
}
