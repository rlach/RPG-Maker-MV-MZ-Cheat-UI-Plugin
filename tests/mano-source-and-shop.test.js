import { afterEach, expect, it, vi } from 'vitest';
import { ManoInputConfigTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/ManoInputConfigTranslator.js';
import { ShopSceneExtensionTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/ShopSceneExtensionTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('uses immutable Mano labels and maps native language variants without harvesting rendered keys', async () => {
    vi.stubGlobal('window', globalThis);
    const plugin = {
        name: 'Mano_InputConfig',
        status: true,
        parameters: { resetCommand: JSON.stringify({ jp: '初期設定に戻す', en: 'Reset' }) },
    };
    vi.stubGlobal('$plugins', [
        {
            ...plugin,
            parameters: { resetCommand: JSON.stringify({ jp: 'Contaminated', en: 'Reset' }) },
        },
    ]);
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => 'var $plugins=' + JSON.stringify([plugin]) + ';',
    }));
    const t = new ManoInputConfigTranslator();
    await t.precomputeCounts();
    const rt = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (s, c) => c + ':' + s,
        translationCache: new Map([
            ['plugin_mano_input_config:初期設定に戻す', 'Restore defaults'],
        ]),
        hasUsableCacheValue(k) {
            return this.translationCache.has(k);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    for (let i = 0; i < 3; i++) {
        expect(t.resolveFromCache('Reset', rt)).toBe('Restore defaults');
        for (const text of ['Restore defaults', '0', '1', 'A', ':OK', 'Always Dash', 'BGM Volume'])
            expect(t.resolveFromCache(text, rt)).toBe(text);
    }
    expect(new Set(rt.trackCacheKeyUsage.mock.calls.map(([k]) => k))).toEqual(
        new Set(['plugin_mano_input_config:初期設定に戻す'])
    );
    expect(t.collectUntranslated({ runtime: rt }).some((e) => e.value === 'Contaminated')).toBe(
        false
    );
    rt.enabled = false;
    expect(t.resolveFromCache('Reset', rt)).toBe('Reset');
});
it('collects and renders the shop empty-slot parameter from the original manifest', async () => {
    vi.stubGlobal('window', globalThis);
    const plugin = {
        name: 'ShopScene_Extension',
        status: true,
        parameters: { NoneItemText: 'なし' },
    };
    vi.stubGlobal('$plugins', [plugin]);
    vi.stubGlobal('fetch', async (url) => ({
        ok: true,
        text: async () =>
            url === 'js/plugins.js'
                ? 'var $plugins=' + JSON.stringify([plugin]) + ';'
                : 'const NoneItemText=params.NoneItemText;',
    }));
    const t = new ShopSceneExtensionTranslator();
    await t.precomputeCounts();
    expect(t.entries.has('なし')).toBe(true);
    const rt = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags() {} },
        getCacheKey: (s, c) => c + ':' + s,
        translationCache: new Map([['plugin_shop_scene_extension:なし', 'None']]),
        hasUsableCacheValue(k) {
            return this.translationCache.has(k);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    expect(t.resolveText('なし', rt)).toBe('None');
    expect(t.resolveText('None', rt)).toBe('None');
    expect(rt.trackCacheKeyUsage).toHaveBeenCalledTimes(1);
    rt.enabled = false;
    expect(t.resolveText('なし', rt)).toBe('なし');
});
