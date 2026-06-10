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

        const runtime = {
            batchManager: backgroundManager,
            _foregroundBatchManager: null,
        };
        Object.assign(runtime, translateOnTheFlyFlowMethods);

        await runtime.startAheadTranslation({
            currentText: 'NPC line',
            currentSpeakerName: 'NPC',
            cacheKey: 'message:ja-en:NPC line',
            maxDepth: 99,
        });

        expect(createTranslationBatchManager).toHaveBeenCalledTimes(1);
        expect(foregroundManager.runBatchedTranslation).toHaveBeenCalledTimes(1);
        expect(backgroundManager.runBatchedTranslation).not.toHaveBeenCalled();
        expect(runtime.batchManager).toBe(backgroundManager);
    });
});
