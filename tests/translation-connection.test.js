import { afterEach, expect, it, vi } from 'vitest';
import { ConfigManager } from '../cheat-engine/www/cheat/translate-engines/ai-engine/ConfigManager.js';

afterEach(() => vi.unstubAllGlobals());

it('checks the selected model without changing the saved connection settings', async () => {
    const engine = {
        host: 'http://localhost:5001/',
        provider: 'openApi',
        selectedModel: 'writer',
        models: ['saved'],
        runtime: { saveSettings: vi.fn() },
    };
    const fetch = vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: 'writer' }] }),
    }));
    vi.stubGlobal('fetch', fetch);
    const { checkAiConnection } = new ConfigManager(engine).getMethods();

    await expect(checkAiConnection()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('http://localhost:5001/v1/models', expect.any(Object));
    expect(engine.models).toEqual(['saved']);
    expect(engine.runtime.saveSettings).not.toHaveBeenCalled();

    engine.selectedModel = 'offline';
    await expect(checkAiConnection()).rejects.toThrow('The selected model is unavailable.');
    fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(checkAiConnection()).rejects.toThrow('HTTP 401');
});
