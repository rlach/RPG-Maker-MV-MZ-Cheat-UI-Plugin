import { describe, expect, it, vi } from 'vitest';

import { BatchProgressTracker } from '../../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/BatchProgressTracker.js';

describe('BatchProgressTracker UI channels', () => {
    it('keeps main queue progress paused while OTF uses its own progress UI', () => {
        const runtime = {
            getOverallTranslationCompletionLine() {
                return 'total 4% complete (ETA 8 days)';
            },
        };
        const mainUi = {
            showSpinner: vi.fn(),
            hideSpinner: vi.fn(),
            hideProgressBox: vi.fn(),
            updateProgressBox: vi.fn(),
        };
        const foregroundUi = {
            showSpinner: vi.fn(),
            hideSpinner: vi.fn(),
            hideProgressBox: vi.fn(),
            updateProgressBox: vi.fn(),
        };

        const mainTracker = new BatchProgressTracker(runtime, mainUi);
        const foregroundTracker = new BatchProgressTracker(runtime, foregroundUi);

        mainTracker.beginQueue();
        mainTracker.beginPhase('translating common events', 150000);
        mainTracker.updateStep('translating common events', 346, 150000);
        mainTracker.pause('OTF');

        foregroundTracker.beginQueue();
        foregroundTracker.beginPhase('translating current event', 69);
        foregroundTracker.updateStep('translating current event', 0, 69);

        const mainLastCall = mainUi.updateProgressBox.mock.lastCall;
        const foregroundLastCall = foregroundUi.updateProgressBox.mock.lastCall;

        expect(mainLastCall).toEqual([
            'translating common events (paused for OTF)',
            '346/150000 translated (0%)',
            'total 4% complete (ETA 8 days)',
            null,
            null,
        ]);
        expect(foregroundLastCall).toEqual([
            'translating current event',
            '0/69 translated (0%)',
            'total 4% complete (ETA 8 days)',
            null,
            null,
        ]);
    });
});
