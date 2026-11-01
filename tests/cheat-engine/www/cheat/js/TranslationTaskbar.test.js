import { it, expect, vi, afterEach } from 'vitest';
import { TranslationTaskbar } from '../../../../../cheat-engine/www/cheat/js/TranslationTaskbar.js';
import { TranslationBatchManager } from '../../../../../cheat-engine/www/cheat/translate-engines/batch-manager/TranslationBatchManager.js';
import {
    createPersistedTranslationSettingsDefaults,
    serializePersistedTranslationSettings,
} from '../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntimeDefaults.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function fixture() {
    const events = {};
    const native = {
        setProgressBar: vi.fn(),
        requestAttention: vi.fn(),
        on: vi.fn((name, callback) => {
            events[name] = callback;
        }),
    };
    const host = {
        nw: { Window: { get: vi.fn(() => native) } },
        document: { hasFocus: () => false },
    };
    const runtime = {
        flashTaskbarOnTranslationComplete: true,
        showTranslationTaskbarProgress: true,
    };
    return { host, native, runtime, events, controller: new TranslationTaskbar(runtime, host) };
}

it('reports numeric progress, clears at completion, and stops flashing on focus', () => {
    const { controller, native, events } = fixture();
    const finish = controller.begin();
    expect(native.setProgressBar).toHaveBeenLastCalledWith(0);
    controller.update('main', { totalChars: 1000, processedChars: 450 });
    expect(native.setProgressBar).toHaveBeenLastCalledWith(0.45);
    controller.update('main', { totalChars: 1000, processedChars: 1000 });
    expect(native.setProgressBar).toHaveBeenLastCalledWith(0.999);
    finish();
    finish();
    expect(native.setProgressBar).toHaveBeenLastCalledWith(-1);
    expect(native.requestAttention).toHaveBeenCalledTimes(1);
    expect(native.requestAttention).toHaveBeenLastCalledWith(true);
    events.focus();
    expect(native.requestAttention).toHaveBeenLastCalledWith(false);
});

it('keeps main progress during nested OTF work and notifies only when all operations end', () => {
    const { controller, native } = fixture();
    const main = controller.begin('main');
    controller.update('main', { totalChars: 100, processedChars: 40 });
    const otf = controller.begin('foreground');
    controller.update('foreground', { totalChars: 10, processedChars: 8 });
    expect(native.setProgressBar).toHaveBeenLastCalledWith(0.4);
    otf();
    expect(native.requestAttention).not.toHaveBeenCalled();
    main();
    expect(native.requestAttention).toHaveBeenLastCalledWith(true);
});

it('is disabled by default, skips dry runs, and can clear feedback when settings turn off', () => {
    const { controller, runtime, native } = fixture();
    controller.begin('main', true)();
    expect(native.setProgressBar).not.toHaveBeenCalled();
    runtime.flashTaskbarOnTranslationComplete = false;
    runtime.showTranslationTaskbarProgress = false;
    controller.begin()();
    expect(native.setProgressBar).not.toHaveBeenCalled();
    expect(native.requestAttention).not.toHaveBeenCalled();
    runtime.flashTaskbarOnTranslationComplete = true;
    runtime.showTranslationTaskbarProgress = true;
    const finish = controller.begin();
    runtime.showTranslationTaskbarProgress = false;
    controller.sync();
    expect(native.setProgressBar).toHaveBeenLastCalledWith(-1);
    finish();
    runtime.flashTaskbarOnTranslationComplete = false;
    controller.sync();
    expect(native.requestAttention).toHaveBeenLastCalledWith(false);
    const defaults = createPersistedTranslationSettingsDefaults();
    expect(defaults.flashTaskbarOnTranslationComplete).toBe(false);
    expect(defaults.showTranslationTaskbarProgress).toBe(false);
    expect(
        serializePersistedTranslationSettings({ ...defaults, showTranslationTaskbarProgress: true })
            .showTranslationTaskbarProgress
    ).toBe(true);
});

it('targets the game from a separate UI window and tolerates missing native APIs', () => {
    const { host, native, runtime } = fixture();
    const external = { __CHEAT_EXTERNAL_WINDOW__: true, opener: host };
    new TranslationTaskbar(runtime, external).begin()();
    expect(host.nw.Window.get).toHaveBeenCalledWith(host);
    expect(native.requestAttention).toHaveBeenLastCalledWith(true);
    expect(() => new TranslationTaskbar(runtime, {}).begin()()).not.toThrow();
    native.setProgressBar.mockImplementation(() => {
        throw new Error('Unavailable');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => new TranslationTaskbar(runtime, host).begin()()).not.toThrow();
});

it.each([false, true])(
    'cleans native state after a batch operation, failure=%s',
    async (failed) => {
        const { host, runtime, native } = fixture();
        vi.stubGlobal('window', host);
        const manager = new TranslationBatchManager(runtime);
        vi.spyOn(manager, '_runBatchedTranslation').mockImplementation(async () => {
            if (failed) throw new Error('Connection refused');
            return { successes: [], failures: [] };
        });
        if (failed)
            await expect(manager.runBatchedTranslation([])).rejects.toThrow('Connection refused');
        else await manager.runBatchedTranslation([]);
        expect(native.setProgressBar).toHaveBeenLastCalledWith(-1);
        expect(native.requestAttention).toHaveBeenLastCalledWith(true);
    }
);
