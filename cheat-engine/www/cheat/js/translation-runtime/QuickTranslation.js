import { ensureRootWindowStateValue, notifyRootWindowEvent } from '../RootWindowState.js';
import { createTranslationBatchManager } from '../../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import { PREDEFINED_NAME_PATTERNS } from './NamePatterns.js';
import { addNamesToCache, countNamesInCache } from './TranslationNames.js';
import {
    chooseNamePattern,
    getNameDetectionEvidence,
    getQuickTagConfigs,
} from './QuickTranslationRules.js';
import { hasCachedFontSizeTags } from './TextWrap.js';
import { applyNamePatternRepair, previewNamePatternRepair } from '../NamePatternCacheRepair.js';

export const QUICK_TRANSLATION_EVENT = 'quick-translation';
export const getQuickTranslationState = () =>
    ensureRootWindowStateValue(QUICK_TRANSLATION_EVENT, () => ({
        active: false,
        message: '',
        error: false,
        showWidthPreview: false,
        suspicions: null,
    }));

export async function quickTranslate(runtime) {
    const state = getQuickTranslationState();
    if (state.active) return;
    state.showWidthPreview = false;
    state.suspicions = null;

    const update = (message, error = false) => {
        Object.assign(state, { message, error });
        notifyRootWindowEvent(QUICK_TRANSLATION_EVENT);
    };
    if (!runtime.engine?.scanForUnknownTagsAsync || !runtime.isEngineFullyConfigured()) {
        update('Configure the AI translation engine in Settings first.', true);
        return;
    }
    if (runtime.checkIfDataIsLoaded()) {
        update('Game data is still loading. Try again once the game is ready.', true);
        return;
    }
    if (!runtime.beginNonOtfTranslationProcess('quick translation')) {
        update('Another translation is already in progress.', true);
        return;
    }

    const originalManager = runtime.batchManager;
    const sourceLang = runtime.sourceLang;
    const targetLang = runtime.targetLang;
    const engine = runtime.engine;
    const ensureCurrent = () => {
        if (
            runtime.sourceLang !== sourceLang ||
            runtime.targetLang !== targetLang ||
            runtime.engine !== engine
        ) {
            throw new Error('Translation settings changed. Start Quick translate again.');
        }
        if (runtime.isBatchQueueAbortRequested()) throw new Error('Quick translation cancelled.');
    };
    const languagePrefix = sourceLang + '-' + targetLang + '-';
    state.active = true;
    let stage = 'Scanning game text (dry run)';
    const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

    try {
        update(stage);
        await yieldToUi();
        ensureCurrent();
        const hud = runtime.getProgressUiAdapter?.();
        let showHud = false;
        runtime.batchManager = createTranslationBatchManager(runtime, {
            progressUi: {
                showSpinner() {
                    if (showHud) hud?.showSpinner();
                },
                hideSpinner() {
                    if (showHud) hud?.hideSpinner();
                },
                hideProgressBox() {
                    if (showHud) hud?.hideProgressBox();
                },
                updateProgressBox(title, message, ...details) {
                    if (showHud) hud?.updateProgressBox(title, message, ...details);
                    update(stage + ' · ' + title + ' · ' + message);
                },
            },
        });

        const requests = runtime.getObjectTranslationTypeDefs().map(({ id }) => ({
            kind: id,
            ...(id === 'names' && { translationPhaseLabel: 'names' }),
            ...(id === 'mapEvents' && { mapIds: runtime.getValidMapInfos().map(({ id }) => id) }),
            ...(id === 'cacheEmptyStrings' && {
                repeatUntilSuccess: !!runtime.cacheEmptyStringsRepeatUntilSuccess,
            }),
        }));
        const runMassTranslation = async (dryRun) => {
            const result = await runtime.batchManager.runBatchedTranslation(
                dryRun ? requests.filter(({ kind }) => kind !== 'cacheEmptyStrings') : requests,
                { dryRun, showSummary: false, backgroundJob: true }
            );
            ensureCurrent();
            if (result.cancelReason) throw new Error('Translation stopped: ' + result.cancelReason);
            return result;
        };
        await runMassTranslation(true);

        update('Finding unknown escape tags');
        const cacheKeys = [...runtime.translationCache.keys()].filter((key) =>
            key.slice(key.indexOf(':') + 1).startsWith(languagePrefix)
        );
        const tagRows = await engine.scanForUnknownTagsAsync(cacheKeys);
        ensureCurrent();
        const configs = getQuickTagConfigs(
            tagRows,
            engine.tagManager.getRegisteredDetectionPatterns()
        );
        for (const config of configs) await runtime.addAiCustomTag(config);

        update('Checking name patterns in the cache');
        await yieldToUi();
        const { dialogueKeys, skillNames } = getNameDetectionEvidence(cacheKeys, languagePrefix);
        const patterns = new Set([
            runtime.namePatternForEnforcing,
            ...PREDEFINED_NAME_PATTERNS.map(({ pattern }) => pattern),
        ]);
        const candidates = [];
        for (const pattern of patterns) {
            if (!pattern) continue;
            try {
                candidates.push({
                    pattern,
                    names: countNamesInCache(dialogueKeys, pattern, languagePrefix),
                });
            } catch (error) {
                if (!(error instanceof SyntaxError)) throw error;
            }
            await yieldToUi();
            ensureCurrent();
        }

        const selected = chooseNamePattern(candidates, skillNames);
        const warnings = [];
        if (!selected) {
            warnings.push(
                'No reliable name pattern found. Check the pattern this game uses in Names Manager and search for names manually.'
            );
        } else {
            runtime.namePatternForEnforcing = selected.pattern;
            runtime.saveSettings();
            runtime.notifyCacheRuntime('quick-translation-name-pattern');
            addNamesToCache(runtime, selected.names.keys(), 'quick-translation-found-names');
        }
        if (
            runtime.manuallySetTextWidths &&
            hasCachedFontSizeTags(cacheKeys, languagePrefix, engine.tagManager.tagEntries)
        ) {
            state.showWidthPreview = true;
            warnings.push(
                'Font-size tags detected. Check the font size multiplier in Settings, then run Mass Translation manually.'
            );
        }
        if (warnings.length) {
            update(warnings.join('\n'), true);
            return;
        }

        stage = 'Translating game text';
        update(stage + ' · ' + selected.names.size + ' names detected');
        await yieldToUi();
        ensureCurrent();
        runtime.applyCachedTranslationsToData();
        showHud = true;
        const { successes, failures } = await runMassTranslation(false);
        update('Checking names in the translation cache');
        await yieldToUi();
        ensureCurrent();
        const repairPlan = previewNamePatternRepair(runtime, selected.pattern);
        const repaired = repairPlan.changes.length
            ? applyNamePatternRepair(runtime, repairPlan)
            : 0;
        state.suspicions = runtime
            .getTranslationSuspicionStore()
            .summarize(runtime.translationCache);
        update(
            'Quick translation finished. ' +
                successes.length +
                ' translated, ' +
                failures.length +
                ' failed.' +
                (repaired ? ` Repaired names in ${repaired} cache entries.` : ''),
            failures.length > 0
        );
    } catch (error) {
        update(error.message || String(error), true);
    } finally {
        runtime.batchManager = originalManager;
        runtime.endNonOtfTranslationProcess();
        state.active = false;
        notifyRootWindowEvent(QUICK_TRANSLATION_EVENT);
    }
}
