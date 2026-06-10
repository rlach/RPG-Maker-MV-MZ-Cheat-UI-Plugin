import { describe, expect, it, vi } from 'vitest';

vi.mock(
    '../../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManagerFactory.js',
    () => ({
        createTranslationBatchManager: vi.fn(),
    })
);

import { createTranslationBatchManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import { translateOnTheFlyFlowMethods } from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyFlowMethods.js';

describe('TranslateOnTheFlyFlowMethods foreground manager isolation', () => {
    it('uses dedicated foreground manager for startAheadTranslation', async () => {
        const backgroundManager = {
            runBatchedTranslation: vi.fn(),
        };

        const foregroundManager = {
            runBatchedTranslation: vi.fn().mockResolvedValue({
                successes: [],
                failures: [],
            }),
        };

        createTranslationBatchManager.mockReturnValue(foregroundManager);

        const getProgressUiAdapter = vi.fn(() => ({
            showSpinner: vi.fn(),
            hideSpinner: vi.fn(),
            hideProgressBox: vi.fn(),
            updateProgressBox: vi.fn(),
        }));

        const runtime = {
            batchManager: backgroundManager,
            _foregroundBatchManager: null,
            getProgressUiAdapter,
        };
        Object.assign(runtime, translateOnTheFlyFlowMethods);

        await runtime.startAheadTranslation({
            currentText: 'NPC line',
            currentSpeakerName: 'NPC',
            cacheKey: 'message:ja-en:NPC line',
            maxDepth: 99,
        });

        expect(createTranslationBatchManager).toHaveBeenCalledTimes(1);
        expect(createTranslationBatchManager).toHaveBeenCalledWith(runtime, {
            progressChannel: 'foreground',
        });
        expect(foregroundManager.runBatchedTranslation).toHaveBeenCalledTimes(1);
        expect(backgroundManager.runBatchedTranslation).not.toHaveBeenCalled();
        expect(runtime.batchManager).toBe(backgroundManager);
    });

    it('shows waiting foreground status and pauses main queue when interrupt is disabled', async () => {
        const foregroundManager = {
            runBatchedTranslation: vi.fn().mockResolvedValue({
                successes: [],
                failures: [],
            }),
            countAmountSync: vi.fn(() => [{ left: 69 }]),
        };
        createTranslationBatchManager.mockReturnValue(foregroundManager);

        const batchManager = {
            onBatchPausedByOtf: vi.fn(),
            onBatchResumed: vi.fn(),
        };

        const updateProgressBox = vi.fn();
        const runtime = {
            _foregroundBatchManager: null,
            interruptQueueForRealtime: false,
            batchManager,
            engine: {
                hasActiveBackgroundRequest: vi.fn(() => true),
            },
            isNonOtfTranslationProcessActive: vi.fn(() => true),
            getActiveNonOtfTranslationProcessLabel: vi.fn(() => 'translating common events'),
            updateProgressBox,
        };
        Object.assign(runtime, translateOnTheFlyFlowMethods);
        runtime.buildForegroundOperationKey = vi.fn(() => 'foreground::key');
        runtime.preemptBackgroundForForeground = vi.fn(() => false);
        runtime.waitForActiveBackgroundRequestToFinish = vi.fn(async () => {
            runtime.engine.hasActiveBackgroundRequest = vi.fn(() => false);
        });

        await runtime.requestForegroundDialogBatch({
            currentText: 'NPC line',
            currentSpeakerName: 'NPC',
            cacheKey: 'message:ja-en:NPC line',
            hasPortrait: false,
            maxDepth: 99,
        });

        expect(updateProgressBox).toHaveBeenCalledWith(
            'current event (waiting for main queue to pause)',
            '0/69 translated (0%)',
            null,
            null,
            null,
            'foreground'
        );
        expect(batchManager.onBatchPausedByOtf).toHaveBeenCalledWith('current event');
        expect(batchManager.onBatchResumed).toHaveBeenCalledWith('translating common events');
        expect(foregroundManager.runBatchedTranslation).toHaveBeenCalledTimes(1);
    });
});
