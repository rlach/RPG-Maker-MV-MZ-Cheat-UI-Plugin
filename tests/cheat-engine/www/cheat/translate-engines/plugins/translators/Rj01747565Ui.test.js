import { afterEach, expect, it, vi } from 'vitest';
import { ActorTextTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ActorTextTranslator.js';
import { InfoEventTextTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/InfoEventTextTranslator.js';
import { RadarChartTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/RadarChartTranslator.js';
import { EnemyPictureBookTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/EnemyPictureBookTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function runtimeFor(t, pairs) {
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map(pairs.map(([s, v]) => [t.getCacheType() + ':' + s, v])),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    return r;
}
it('extracts event captions without collecting font size or offsets', () => {
    const t = new InfoEventTextTranslator();
    t.collectCommandTexts([
        { code: 108, parameters: ['info:アイテム屋,40'] },
        { code: 408, parameters: ['infoMove:0,-20'] },
    ]);
    expect([...t.entries.keys()]).toEqual(['アイテム屋']);
});
it('translates shared actor descriptions without changing the source getter or parameters', async () => {
    const source = '悪の秘密組織と戦う魔法少女。\n回復も可能。';
    const parameters = {
        ActorDescriptions: JSON.stringify([
            JSON.stringify({ ActorId: '1', Description: JSON.stringify(source) }),
        ]),
    };
    vi.stubGlobal('window', {
        $plugins: [{ name: 'ActorText', status: true, parameters }],
        getActorDescription: (id) => (id === 1 ? source : ''),
    });
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '' }));
    const t = new ActorTextTranslator();
    await t.precomputeCounts();
    expect(t.entries.has(source)).toBe(true);
    runtimeFor(t, [[source, 'A magical girl.\nShe can heal.']]);
    expect(t.enablePluginTranslation()).toBe(true);
    expect(window.getActorDescription(1)).toBe('A magical girl.\nShe can heal.');
    expect(window.getActorDescription(2)).toBe('');
    expect(JSON.parse(JSON.parse(parameters.ActorDescriptions)[0]).Description).toBe(
        JSON.stringify(source)
    );
});
it('translates canvas chart labels locally and restores the canvas function on failure', () => {
    const draw = vi.fn();
    const context = { fillText: draw };
    vi.stubGlobal('window', {
        RadarChart: {
            drawRadarChart(bitmap) {
                bitmap.context.fillText('物理', 1, 2);
                throw new Error('render');
            },
        },
    });
    const t = new RadarChartTranslator();
    runtimeFor(t, [['物理', 'Physical']]);
    t.enablePluginTranslation();
    expect(() => window.RadarChart.drawRadarChart({ context })).toThrow('render');
    expect(draw).toHaveBeenCalledWith('Physical', 1, 2);
    expect(context.fillText).toBe(draw);
});
it('catalogs bestiary terms, completion formats and descriptions without translating metadata keys', async () => {
    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'EnemyPictureBook',
                status: true,
                parameters: {
                    terms: JSON.stringify({
                        percentFormat: '図鑑完成率 %3% (%1/%2)',
                        hint: '決定:詳細をスクロール',
                    }),
                    descTag: '図鑑説明',
                },
            },
        ],
    });
    vi.stubGlobal('fetch', async (url) => ({
        ok: true,
        text: async () =>
            url === 'data/Enemies.json'
                ? JSON.stringify([
                      null,
                      { note: '<図鑑説明>\n説明文\n二行目\n</図鑑説明><unrelated:keep>' },
                  ])
                : '',
    }));
    const t = new EnemyPictureBookTranslator();
    await t.precomputeCounts();
    expect(t.entries.has('説明文\n二行目')).toBe(true);
    expect(t.entries.has('keep')).toBe(false);
    const template = [...t.entries.keys()].find((v) => v.startsWith('図鑑完成率'));
    const r = runtimeFor(t, [[template, 'Completed \\COT[0]% (\\COT[1]/\\COT[2])']]);
    expect(t.resolveText('図鑑完成率 48% (13/27)', r)).toBe('Completed 48% (13/27)');
});
