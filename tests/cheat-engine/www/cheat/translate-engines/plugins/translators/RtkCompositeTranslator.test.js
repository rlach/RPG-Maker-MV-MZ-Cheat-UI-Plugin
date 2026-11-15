import { afterEach, expect, it, vi } from 'vitest';
import { RtkCompositeTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/RtkCompositeTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('collects source titles rather than English placeholders or command syntax', () => {
    vi.stubGlobal('window', { $plugins: [] });
    const t = new RtkCompositeTranslator();
    t.collectCommandTexts([
        { code: 356, parameters: ['RTK1_Composite shop custom English%20name 調理鍋'] },
        { code: 356, parameters: ['RTK1_Composite workroom-safe item English 工房'] },
        { code: 356, parameters: ['RTK1_Composite open English 合成'] },
        { code: 356, parameters: ['RTK1_Composite learn item 2'] },
    ]);
    expect([...t.entries.keys()]).toEqual(['調理鍋', '工房', '合成']);
});

it('uses the original Japanese title for both language branches and tracks only its source key', () => {
    let japanese = false;
    const original = vi.fn((args) => (japanese ? args[3] : args[2]));
    vi.stubGlobal('window', {
        RTK: { CP: { command: original }, _calls: { RTK1_Composite: original.bind({}) } },
    });
    const t = new RtkCompositeTranslator();
    let enabled = true;
    const r = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text, type) => type + ':' + text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => true,
        translationCache: new Map([['plugin_rtk_composite:調理鍋', 'Cooking Pot']]),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    const args = ['shop', 'custom', 'English%20name', '調理鍋'];
    expect(window.RTK._calls.RTK1_Composite(args)).toBe('Cooking Pot');
    japanese = true;
    expect(window.RTK._calls.RTK1_Composite(args)).toBe('Cooking Pot');
    expect(args).toEqual(['shop', 'custom', 'English%20name', '調理鍋']);
    expect(r.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual([
        'plugin_rtk_composite:調理鍋',
        'plugin_rtk_composite:調理鍋',
    ]);
    enabled = false;
    japanese = false;
    expect(window.RTK.CP.command(args)).toBe('English%20name');
});

it('keeps the source title on cache miss and passes non-title commands unchanged', () => {
    const original = vi.fn((args) => args);
    vi.stubGlobal('window', {
        RTK: { CP: { command: original }, _calls: { RTK1_Composite: original.bind({}) } },
    });
    const t = new RtkCompositeTranslator();
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => false,
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    t.enablePluginTranslation();
    expect(window.RTK.CP.command(['open', 'English', '調理鍋'])).toEqual([
        'open',
        '調理鍋',
        '調理鍋',
    ]);
    const args = ['learn', 'item', '2'];
    expect(window.RTK.CP.command(args)).toBe(args);
});
