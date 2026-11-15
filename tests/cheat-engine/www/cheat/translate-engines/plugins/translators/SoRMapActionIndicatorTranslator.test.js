import { afterEach, expect, it, vi } from 'vitest';
import { SoRMapActionIndicatorTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SoRMapActionIndicatorTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('extracts caption payloads with the same icon and key parsing as the plugin', () => {
    const t = new SoRMapActionIndicatorTranslator();
    t.collectCommandTexts([
        { code: 108, parameters: ['<ActionIndicator:話す>'] },
        { code: 408, parameters: ['<ActionIndicator:\\I[12]\\K[Z]調べる>'] },
        { code: 401, parameters: ['<ActionIndicator:ignored>'] },
    ]);
    expect([...t.entries.keys()]).toEqual(['話す', '調べる']);
});
it('translates before indicator layout, preserves icon/key and tracks only source across updates', () => {
    const tag = { text: '話す', icon: 12, key: 'Z' };
    class Player {
        CheckEnableActions() {
            return tag;
        }
    }
    vi.stubGlobal('window', { Game_Player: Player });
    const t = new SoRMapActionIndicatorTranslator();
    let enabled = true;
    const r = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => true,
        translationCache: new Map([['話す', 'Talk']]),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    const player = new Player();
    for (let i = 0; i < 2; i++)
        expect(player.CheckEnableActions()).toEqual({ text: 'Talk', icon: 12, key: 'Z' });
    expect(tag.text).toBe('話す');
    expect(r.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual(['話す', '話す']);
    enabled = false;
    expect(player.CheckEnableActions()).toBe(tag);
});
