import { afterEach, expect, it, vi } from 'vitest';
import { Rj01310953MenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/Rj01310953MenuTranslator.js';
import { FadeTextTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FadeTextTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('scans menu source and resolves changing volume values through one template', async () => {
    const source = `this.addCommand('BGM 音量: ' + ConfigManager.bgmVolume, 'bgmVolume');
        this.addCommand('ロード', 'load');
        var description = item === 'system' ? 'システム設定を開きます。' : item.description;`;
    vi.stubGlobal('window', {
        $plugins: [{ name: 'custom-menu-ui-plugin-complete', status: true, parameters: {} }],
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, text: async () => source }))
    );
    const t = new Rj01310953MenuTranslator();
    await t.precomputeCounts();
    expect([...t.entries.keys()]).toContain('システム設定を開きます。');
    expect([...t.entries.keys()]).toContain('ロード');
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (key) => key === 'BGM 音量: \\COT[0]',
        translationCache: new Map([['BGM 音量: \\COT[0]', 'BGM Volume: \\COT[0]']]),
    };
    vi.spyOn(t, 'registerPluginCustomTags').mockImplementation(() => {});
    expect(t.resolveText('BGM 音量: 100', r)).toBe('BGM Volume: 100');
    expect(t.resolveText('BGM 音量: 40', r)).toBe('BGM Volume: 40');
    t.resolveText('BGM Volume: 100', r);
    expect(r.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual([
        'BGM 音量: \\COT[0]',
        'BGM 音量: \\COT[0]',
    ]);
});

it('collects only FadeText add text, preserving command arguments and standard message keys', () => {
    const t = new FadeTextTranslator();
    t.collectCommandTexts([
        { code: 356, parameters: ['FadeText add ユウ！聞いてるのか？ 0 200 30 180 0 Arial'] },
        { code: 356, parameters: ['FadeText stop'] },
        { code: 356, parameters: ['Other add 無関係 0 0'] },
    ]);
    expect([...t.entries.keys()]).toEqual(['ユウ！聞いてるのか？']);
    expect(t.getCacheType()).toBe('message');
    const original = vi.fn();
    class GameMap {}
    GameMap.prototype.addFadeText = original;
    vi.stubGlobal('window', { Game_Map: GameMap });
    let enabled = true;
    const r = {
        isTranslationEnabled: () => enabled,
        getPreferredMessageCacheEntry: () => ({ value: 'Are you listening?' }),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    const map = new GameMap();
    map.addFadeText('ユウ！聞いてるのか？', 0, 200, 30, 180, 0, 'Arial');
    expect(original).toHaveBeenLastCalledWith('Are you listening?', 0, 200, 30, 180, 0, 'Arial');
    enabled = false;
    map.addFadeText('ユウ！聞いてるのか？', 0, 200);
    expect(original).toHaveBeenLastCalledWith('ユウ！聞いてるのか？', 0, 200);
});
