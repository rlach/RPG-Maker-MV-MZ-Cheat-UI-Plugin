import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../cheat-engine/www/cheat/js/TranslateOnTheFlyState.js', () => ({
    TranslateOnTheFlyState: {
        isEnabled: vi.fn(() => false),
        setEnabled: vi.fn(),
        toggleEnabled: vi.fn(() => false),
    },
}));

vi.mock('../../../../../../cheat-engine/www/cheat/js/TranslateCacheRuntime.js', () => ({
    ensureTranslateCacheRuntime: vi.fn(() => null),
}));

import { translateOnTheFlyCoreMethods } from '../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyCoreMethods.js';

function createRuntimeFixture({
    nonOtfActive = false,
    foregroundActive = false,
    pendingCount = 0,
} = {}) {
    const runtime = {
        nonOtfTranslationProcess: {
            active: !!nonOtfActive,
            label: nonOtfActive ? 'object translation' : '',
            startedAt: 0,
        },
        pendingTranslations: new Map(),
        _batchQueueAbortRequested: false,
        _realtimeAbortRequested: false,
        engine: {
            cancelActiveRequest: vi.fn(() => true),
            cancelActiveBackgroundRequest: vi.fn(() => true),
        },
        isForegroundDialogBatchActive: vi.fn(() => !!foregroundActive),
    };

    for (let i = 0; i < pendingCount; i++) {
        runtime.pendingTranslations.set(`k-${i}`, true);
    }

    Object.assign(runtime, translateOnTheFlyCoreMethods);
    return runtime;
}

describe('TranslateOnTheFlyCoreMethods abort scope', () => {
    it('requestRealtimeAbort does not abort regular non-OTF queue when no realtime work exists', () => {
        const runtime = createRuntimeFixture({
            nonOtfActive: true,
            foregroundActive: false,
            pendingCount: 0,
        });

        const requested = runtime.requestRealtimeAbort();

        expect(requested).toBe(false);
        expect(runtime._batchQueueAbortRequested).toBe(false);
        expect(runtime._realtimeAbortRequested).toBe(false);
        expect(runtime.engine.cancelActiveRequest).not.toHaveBeenCalled();
        expect(runtime.engine.cancelActiveBackgroundRequest).not.toHaveBeenCalled();
    });

    it('requestRealtimeAbort cancels active realtime translation only', () => {
        const runtime = createRuntimeFixture({
            nonOtfActive: true,
            foregroundActive: true,
            pendingCount: 0,
        });

        const requested = runtime.requestRealtimeAbort();

        expect(requested).toBe(true);
        expect(runtime._batchQueueAbortRequested).toBe(false);
        expect(runtime._realtimeAbortRequested).toBe(true);
        expect(runtime.engine.cancelActiveRequest).toHaveBeenCalledWith('request_aborted');
        expect(runtime.engine.cancelActiveBackgroundRequest).not.toHaveBeenCalled();
    });
});
