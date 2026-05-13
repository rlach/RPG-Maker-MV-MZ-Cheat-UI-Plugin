import { findNearestMessageEntry } from '../EventCommandTraversal.js';
import {
    computeLangPairCompletionByKeyLength,
    computeLangPairCompletionByCacheTypes,
} from '../TranslationCompletionMetrics.js';
import { BatchSummaryReporter } from '../../translate-engines/batch-manager/BatchSummaryReporter.js';
import { createTranslationBatchManager } from '../../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import { CurrentEvent } from '../../translate-engines/translation-phases/CurrentEvent.js';

export const translateOnTheFlyFlowMethods = {
    normalizeQueueScopeTypes(cacheTypes) {
        const result = [];
        const seen = new Set();
        let safeTypes = [];
        if (Array.isArray(cacheTypes)) {
            safeTypes = cacheTypes;
        } else if (cacheTypes instanceof Set) {
            safeTypes = Array.from(cacheTypes);
        }

        for (const type of safeTypes) {
            const normalized = String(type || '').trim();
            if (!normalized || seen.has(normalized)) {
                continue;
            }
            seen.add(normalized);
            result.push(normalized);
        }

        return result;
    },

    clearQueueCompletionScope() {
        this.queueCompletionScope = null;
    },

    startQueueCompletionScope(cacheTypes) {
        this.clearQueueCompletionScope();

        if (!this.dryRunExecutedAtLeastOnce) {
            return;
        }

        const normalizedTypes = this.normalizeQueueScopeTypes(cacheTypes);
        if (normalizedTypes.length === 0) {
            return;
        }

        const useAllTypes = normalizedTypes.includes('*');
        const scopedStats = useAllTypes
            ? computeLangPairCompletionByKeyLength({
                  translationCache: this.translationCache,
                  sourceLang: this.sourceLang,
                  targetLang: this.targetLang,
              })
            : computeLangPairCompletionByCacheTypes({
                  translationCache: this.translationCache,
                  sourceLang: this.sourceLang,
                  targetLang: this.targetLang,
                  cacheTypes: normalizedTypes,
              });

        this.queueCompletionScope = {
            cacheTypes: normalizedTypes,
            useAllTypes,
            totalKeyLength: Math.max(0, Number(scopedStats.totalKeyLength) || 0),
        };
    },

    getQueueScopedCompletionStats() {
        const scope = this.queueCompletionScope;
        if (!scope || !Array.isArray(scope.cacheTypes) || !scope.cacheTypes.length) {
            return null;
        }

        const scopedStats = scope.useAllTypes
            ? computeLangPairCompletionByKeyLength({
                  translationCache: this.translationCache,
                  sourceLang: this.sourceLang,
                  targetLang: this.targetLang,
              })
            : computeLangPairCompletionByCacheTypes({
                  translationCache: this.translationCache,
                  sourceLang: this.sourceLang,
                  targetLang: this.targetLang,
                  cacheTypes: scope.cacheTypes,
              });

        const totalKeyLength = Math.max(
            0,
            Number(scope.totalKeyLength) || Number(scopedStats.totalKeyLength) || 0
        );
        const translatedKeyLength = Math.min(
            totalKeyLength,
            Math.max(0, Number(scopedStats.translatedKeyLength) || 0)
        );
        const completionPercent =
            totalKeyLength > 0 ? (translatedKeyLength / totalKeyLength) * 100 : 0;

        return {
            totalKeyLength,
            translatedKeyLength,
            completionPercent,
        };
    },

    getBatchThroughputSamples() {
        if (!Array.isArray(this.batchThroughputSamples)) {
            this.batchThroughputSamples = [];
        }

        return this.batchThroughputSamples;
    },

    recordBatchThroughputSample(requestedChars, durationMs) {
        const chars = Math.max(0, Number(requestedChars) || 0);
        const elapsedMs = Math.max(0, Number(durationMs) || 0);
        if (chars <= 0 || elapsedMs <= 0) {
            return;
        }

        const charsPerSecond = chars / (elapsedMs / 1000);
        if (!Number.isFinite(charsPerSecond) || charsPerSecond <= 0) {
            return;
        }

        const samples = this.getBatchThroughputSamples();
        samples.push(charsPerSecond);

        const maxSamples = 10;
        if (samples.length > maxSamples) {
            samples.splice(0, samples.length - maxSamples);
        }
    },

    getAverageBatchCharsPerSecond() {
        const samples = this.getBatchThroughputSamples().filter(
            (sample) => Number.isFinite(sample) && sample > 0
        );
        if (samples.length === 0) {
            return 0;
        }

        const sum = samples.reduce((acc, sample) => acc + sample, 0);
        return sum / samples.length;
    },

    formatEtaFromSeconds(seconds) {
        const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
        const days = Math.floor(safeSeconds / 86400);
        const hours = Math.floor((safeSeconds % 86400) / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const secs = safeSeconds % 60;

        const parts = [];
        if (days > 0) {
            parts.push(`${days}d`);
        }
        if (hours > 0 || days > 0) {
            parts.push(`${hours}h`);
        }
        if (minutes > 0 || hours > 0 || days > 0) {
            parts.push(`${minutes}m`);
        }
        parts.push(`${secs}s`);

        return parts.join(' ');
    },

    markDryRunExecuted() {
        this.dryRunExecutedAtLeastOnce = true;
        this.saveSettings();
    },

    getOverallTranslationCompletionStats() {
        return computeLangPairCompletionByKeyLength({
            translationCache: this.translationCache,
            sourceLang: this.sourceLang,
            targetLang: this.targetLang,
        });
    },

    getOverallTranslationCompletionLine() {
        if (!this.dryRunExecutedAtLeastOnce) {
            return null;
        }

        const stats =
            this.getQueueScopedCompletionStats() || this.getOverallTranslationCompletionStats();
        const remainingChars = Math.max(
            0,
            Number(stats.totalKeyLength || 0) - Number(stats.translatedKeyLength || 0)
        );
        const avgCharsPerSecond = this.getAverageBatchCharsPerSecond();

        if (remainingChars <= 0) {
            return `total ${stats.completionPercent.toFixed(1)}% complete (ETA 0s)`;
        }

        if (avgCharsPerSecond > 0) {
            const etaSeconds = remainingChars / avgCharsPerSecond;
            return `total ${stats.completionPercent.toFixed(1)}% complete (ETA ${this.formatEtaFromSeconds(etaSeconds)})`;
        }

        return `total ${stats.completionPercent.toFixed(1)}% complete`;
    },

    hasPendingDialogTranslation() {
        if (this.isForegroundDialogBatchActive()) {
            return true;
        }

        return !!this.engine?.hasActiveBackgroundRequest?.();
    },

    isForegroundDialogBatchActive() {
        return !!(this._foregroundDialogBatchState && this._foregroundDialogBatchState.active);
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
        if (!result || typeof result !== 'object') {
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
                (failure.preempted || failure.cancelReason === 'background_preempted')
            );
        });
    },

    async batchTranslateWithBackgroundRetry(items, label = 'background batch') {
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
                `[TranslateOnTheFly] Background batch preempted (${label}), instant retry ${attempts}/${maxPreemptedRetries}`
            );
            this.batchManager?.onBatchPausedByOtf?.('translating event');
            await this.waitForForegroundDialogBatch();
            this.batchManager?.onBatchResumed?.(label);
        }

        return { successes: [], failures: [] };
    },

    getCurrentMapIdForPhasePriority() {
        return window.$gameMap && typeof $gameMap.mapId === 'function'
            ? Number($gameMap.mapId()) || 0
            : 0;
    },

    buildForegroundOperationKey({
        currentText,
        currentSpeakerName,
        maxDepth,
        messageHasPortrait = false,
    }) {
        const interpreter = this.findMessageInterpreter();
        const normalized = this.resolveOriginalMessageContext(
            currentText,
            currentSpeakerName,
            interpreter
        );
        const normalizedText = normalized.text || currentText || '';
        const normalizedSpeaker = normalized.speaker || currentSpeakerName || '';

        const choices =
            $gameMessage && typeof $gameMessage.choices === 'function'
                ? $gameMessage._translateOriginalChoices || $gameMessage.choices() || []
                : [];

        const choiceKeyPart = Array.isArray(choices)
            ? choices.map((choice) => this.getCacheKey(choice, 'choice')).join('|')
            : '';

        const mapId = this.getCurrentMapIdForPhasePriority();
        const eventId =
            interpreter && typeof interpreter._eventId === 'number' ? interpreter._eventId : 0;
        const index =
            interpreter && typeof interpreter._index === 'number' ? interpreter._index : 0;
        const depth = Number(maxDepth) || 0;

        return [
            mapId,
            eventId,
            index,
            depth,
            this.getMessageCacheKey(normalizedText, {
                hasPortrait: !!messageHasPortrait,
            }),
            this.getCacheKey(normalizedSpeaker, 'speaker'),
            choiceKeyPart,
        ].join('::');
    },

    preemptBackgroundForForeground(operationKey, sourceTrigger = 'unknown') {
        if (!this.cancelBackgroundForOnTheFly) {
            return false;
        }

        if (!this.engine || typeof this.engine.cancelActiveBackgroundRequest !== 'function') {
            return false;
        }

        if (this._foregroundPreemptedOperationKey === operationKey) {
            return false;
        }

        if (!this.engine.hasActiveBackgroundRequest?.()) {
            return false;
        }

        const cancelled = this.engine.cancelActiveBackgroundRequest();
        if (cancelled) {
            this._foregroundPreemptedOperationKey = operationKey;
            console.log(
                `[TranslateOnTheFly] Foreground preempted active background request (trigger: ${sourceTrigger})`
            );
        }

        return cancelled;
    },

    requestForegroundDialogBatch({
        currentText,
        currentSpeakerName,
        cacheKey,
        hasPortrait = false,
        maxDepth,
        sourceTrigger = 'unknown',
    }) {
        if (!this._foregroundDialogBatchState) {
            this._foregroundDialogBatchState = {
                active: false,
                operationKey: '',
                sourceTrigger: '',
                startedAt: 0,
                promise: null,
            };
        }

        const state = this._foregroundDialogBatchState;
        const operationKey = this.buildForegroundOperationKey({
            currentText,
            currentSpeakerName,
            maxDepth,
            messageHasPortrait: !!hasPortrait,
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
                hasPortrait: !!hasPortrait,
                maxDepth,
            })
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
                `[TranslateOnTheFly] Foreground batch watchdog released lock after ${watchdogMs}ms`
            );
            state.active = false;
            state.operationKey = '';
            state.sourceTrigger = '';
            state.startedAt = 0;
            state.promise = null;
        }, watchdogMs);

        return promise.finally(() => {
            if (state.promise !== promise) {
                return;
            }

            state.active = false;
            state.operationKey = '';
            state.sourceTrigger = '';
            state.startedAt = 0;
            state.promise = null;
            this._foregroundPreemptedOperationKey = '';
        });
    },

    async runObjectTranslationJob(selectedTypeIds, options = {}) {
        const dryRun = !!options?.dryRun;

        if (this.objectTranslationJob.active) {
            this.notify('warn', 'Object translation is already in progress');
            return { started: false, reason: 'already-running' };
        }

        if (!this.engine || typeof this.engine.batchTranslate !== 'function') {
            this.notify('error', 'Translation engine not initialized');
            return { started: false, reason: 'engine-not-initialized' };
        }

        if (!this.isEngineFullyConfigured()) {
            this.notify('warn', 'Translation engine is not fully configured');
            return { started: false, reason: 'engine-not-configured' };
        }

        if (!this.beginNonOtfTranslationProcess('object translation')) {
            return { started: false, reason: 'process-active' };
        }

        const allStats = this.getObjectTranslationStats();
        const selectedStats = allStats.filter((stat) => selectedTypeIds.includes(stat.id));
        const requests = selectedStats
            .filter((stat) => stat.left > 0)
            .map((stat) => ({
                kind: stat.id,
                ...(stat.id === 'cacheEmptyStrings' && {
                    repeatUntilSuccess: !!this.cacheEmptyStringsRepeatUntilSuccess,
                }),
            }));

        this.objectTranslationJob = {
            active: true,
            totalDone: 0,
            totalTarget: 0,
            runErrors: 0,
        };

        if (!this.batchManager) {
            this.batchManager = createTranslationBatchManager(this);
        }

        const startedAt = Date.now();
        const aggregatedErrorStats = BatchSummaryReporter.createErrorStatsAccumulator();
        const mergeStats = (stats) => {
            BatchSummaryReporter.mergeErrorStats(aggregatedErrorStats, stats);
        };

        try {
            this.applyCachedTranslationsToData();
            const translated = await this.batchManager.runBatchedTranslation(requests, {
                translationPhaseLabel: 'object translation',
                backgroundJob: true,
                showSummary: false,
                dryRun,
            });

            this.objectTranslationJob.totalDone = translated.successes.length;
            this.objectTranslationJob.totalTarget =
                translated.successes.length + translated.failures.length;
            this.objectTranslationJob.runErrors = translated.failures.length;
            mergeStats(translated.stats);

            const summary = BatchSummaryReporter.buildSummary({
                batchLabel: 'object translation',
                totalItems: this.objectTranslationJob.totalTarget,
                successes: this.objectTranslationJob.totalDone,
                failures: this.objectTranslationJob.runErrors,
                errorStats: aggregatedErrorStats,
                durationMs: Date.now() - startedAt,
                currentPhaseErrors: 0,
                totalCumulativeErrors: this.objectTranslationJob.runErrors,
            });
            BatchSummaryReporter.showAlert(summary);
            BatchSummaryReporter.logSummary(summary);

            return {
                started: true,
                completed: true,
                totalDone: this.objectTranslationJob.totalDone,
                totalTarget: this.objectTranslationJob.totalTarget,
                runErrors: this.objectTranslationJob.runErrors,
            };
        } catch (error) {
            console.error('[TranslateOnTheFly] Object translation job failed:', error);
            this.notify('error', `Object translation failed: ${error.message || error}`);

            return {
                started: true,
                completed: false,
                reason: 'job-failed',
                error: error instanceof Error ? error : new Error(String(error || 'unknown error')),
            };
        } finally {
            this.objectTranslationJob.active = false;
            this.endNonOtfTranslationProcess();
        }
    },

    findMessageInterpreter() {
        const candidates = [];

        if (window.$gameMap) {
            if ($gameMap._interpreter) {
                candidates.push($gameMap._interpreter);
            }

            if (typeof $gameMap.events === 'function') {
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
            '[findMessageInterpreter] Found candidates:',
            expandedCandidates.length,
            expandedCandidates.map((it) => ({
                isRunning: it && typeof it.isRunning === 'function' && it.isRunning(),
                waitMode: it && it._waitMode,
                haslist: it && Array.isArray(it._list),
                listLength: it && it._list && it._list.length,
                index: it && it._index,
            }))
        );

        // First: look for interpreter waiting on message
        const found = expandedCandidates.find(
            (it) =>
                it &&
                typeof it.isRunning === 'function' &&
                it.isRunning() &&
                it._waitMode === 'message'
        );

        if (found) {
            return found;
        }

        // Fallback: try to find any running interpreter with a list
        const fallback = expandedCandidates.find(
            (it) =>
                it &&
                typeof it.isRunning === 'function' &&
                it.isRunning() &&
                it._list &&
                it._list.length > 0
        );
        if (fallback) {
            console.log(
                '[findMessageInterpreter] Using fallback interpreter (not waiting for message but has list)'
            );
            return fallback;
        }

        return null;
    },

    getInterpreterCurrentMessageEntry(interpreter) {
        if (!interpreter || !Array.isArray(interpreter._list) || interpreter._list.length === 0) {
            return null;
        }

        const found = findNearestMessageEntry(interpreter._list, Number(interpreter._index) || 0);
        if (!found) {
            return null;
        }

        return {
            text: found.text,
            speaker: found.speaker,
        };
    },

    resolveOriginalMessageContext(currentText, currentSpeaker, interpreter) {
        let resolvedText = currentText || '';
        let resolvedSpeaker = currentSpeaker || '';

        if (window.$gameMessage) {
            if (
                typeof $gameMessage._translateOriginalText === 'string' &&
                $gameMessage._translateOriginalText.length > 0
            ) {
                resolvedText = $gameMessage._translateOriginalText;
            }
            if (
                typeof $gameMessage._translateOriginalSpeaker === 'string' &&
                $gameMessage._translateOriginalSpeaker.length > 0
            ) {
                resolvedSpeaker = $gameMessage._translateOriginalSpeaker;
            }
        }

        const entry = this.getInterpreterCurrentMessageEntry(interpreter);
        if (entry) {
            const displayedText =
                window.$gameMessage && typeof $gameMessage.allText === 'function'
                    ? $gameMessage.allText() || ''
                    : '';
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
            text: resolvedText || '',
            speaker: resolvedSpeaker || '',
        };
    },

    async startAheadTranslation({ currentText, currentSpeakerName, cacheKey, maxDepth }) {
        if (!this.batchManager) {
            this.batchManager = createTranslationBatchManager(this);
        }

        try {
            return await this.batchManager.runBatchedTranslation(
                [
                    {
                        kind: 'currentEvent',
                        currentText,
                        currentSpeakerName,
                        cacheKey,
                        fullEvent: true,
                        maxDepth,
                    },
                ],
                {
                    backgroundJob: false,
                    showSummary: false,
                }
            );
        } catch (error) {
            const strategy = CurrentEvent.getInstance();
            if (typeof strategy.handleFatalError === 'function') {
                strategy.handleFatalError({ runtime: this, error });
            }
            return null;
        }
    },
};
