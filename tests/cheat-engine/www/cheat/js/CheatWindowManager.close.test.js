import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
vi.mock('../../../../../cheat-engine/www/cheat/js/UnifiedSettings.js', () => ({
    ensureSettingsMigration: vi.fn(),
    getUnifiedSetting: () => ({}),
    setUnifiedSetting: vi.fn(),
}));
vi.mock('../../../../../cheat-engine/www/cheat/js/RpgMakerRuntime.js', () => ({
    isRpgMakerMv: () => false,
}));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});
it('leaves the game close/save handler in control and closes the cheat window only after the game is closed', async () => {
    const main = new EventEmitter();
    main.close = vi.fn();
    const save = vi.fn(async () => {});
    main.on('close', save);
    vi.stubGlobal('nw', { Window: { get: () => main } });
    vi.stubGlobal('window', {});
    const { CHEAT_WINDOW_MANAGER: manager } =
        await import('../../../../../cheat-engine/www/cheat/js/CheatWindowManager.js');
    manager.externalWindow = { closed: false, close: vi.fn() };
    main.emit('close');
    expect(save).toHaveBeenCalledOnce();
    expect(main.listenerCount('close')).toBe(1);
    expect(main.close).not.toHaveBeenCalled();
    expect(manager.externalWindow.close).not.toHaveBeenCalled();
    main.emit('closed');
    expect(manager.externalWindow.close).toHaveBeenCalledWith(true);
});
