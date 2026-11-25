import { it, expect, vi, afterEach } from 'vitest';
import { SakuraEventIndicatorTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/SakuraEventIndicatorTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('collects parsed notes, command overrides and transfer names from original files', async () => {
    vi.stubGlobal('window', globalThis);
    const files = {
        MapInfos: [null, { id: 1, name: '町' }],
        CommonEvents: [
            null,
            {
                list: [
                    {
                        code: 357,
                        parameters: [
                            'Sakura_EventIndicator',
                            'setIndicator',
                            '',
                            { note: 'red （ 質問 ）' },
                        ],
                    },
                ],
            },
        ],
        Map001: {
            events: [
                null,
                {
                    note: 'red 「コンビニ」横線2',
                    pages: [{ list: [{ code: 201, parameters: [0, 1] }] }],
                },
            ],
        },
    };
    vi.stubGlobal('fetch', async (url) => ({
        ok: true,
        text: async () => JSON.stringify(files[url.replace('data/', '').replace('.json', '')]),
    }));
    const t = new SakuraEventIndicatorTranslator();
    await t.precomputeCounts();
    expect([...t.entries.keys()]).toEqual(expect.arrayContaining(['コンビニ', ' 質問 ', '町']));
    expect(t.entries.has('red 「コンビニ」横線2')).toBe(false);
});
it('translates the parsed canvas payload, keeps syntax/state original and never harvests translated redraws', () => {
    class Character {
        createTextOnEvent(text, type) {
            this.drawn = text;
            this.mode = type;
            return text.length;
        }
    }
    vi.stubGlobal('window', { Sprite_Character: Character });
    const t = new SakuraEventIndicatorTranslator();
    t.entries.set('コンビニ', { text: 'コンビニ' });
    const rt = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags() {} },
        getCacheKey: (s, c) => c + ':' + s,
        translationCache: new Map([
            ['plugin_sakura_event_indicator:コンビニ', 'Convenience store'],
        ]),
        hasUsableCacheValue(k) {
            return this.translationCache.has(k);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(rt);
    vi.spyOn(t, 'precomputeCounts').mockResolvedValue();
    expect(t.enablePluginTranslation()).toBe(true);
    const sprite = new Character();
    t.entries.clear(); // The first map can render before the source scan finishes.
    for (let i = 0; i < 3; i++) expect(sprite.createTextOnEvent('コンビニ', 'triangle')).toBe(17);
    expect(sprite.drawn).toBe('Convenience store');
    expect(sprite.mode).toBe('triangle');
    sprite.createTextOnEvent('Convenience store', 'triangle');
    expect(rt.trackCacheKeyUsage).toHaveBeenCalledTimes(3);
    rt.enabled = false;
    expect(sprite.createTextOnEvent('コンビニ', 'bubble')).toBe(4);
    expect(sprite.drawn).toBe('コンビニ');
});
