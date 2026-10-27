import { afterEach, expect, it, vi } from 'vitest';
import { SeedPresserUITranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/SeedPresserUITranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('scans multiline gallery captions, equipment metadata and dynamic quantity templates', async () => {
    const script = [
        "this.drawNoteText('hint', 0, 0);",
        "this.drawNoteText('noteValue', 0, 0);",
        'this.drawTextEx(`${item.meta.plus} / ${item.meta.minus}`, 0, 0);',
        'this.drawTextEx(`所持数：${$gameParty.numItems(item)}`, 0, 0);',
    ];
    const plugin = {
        name: 'SceneCustomMenu',
        status: true,
        parameters: {
            Scene1: JSON.stringify({
                Id: 'Scene_Site',
                WindowList: JSON.stringify([
                    JSON.stringify({ ItemDrawScript: JSON.stringify(script) }),
                ]),
            }),
        },
    };
    vi.stubGlobal('window', { $plugins: [plugin] });
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => ({
            ok: true,
            json: async () =>
                path.includes('CommonEvents')
                    ? [
                          null,
                          {
                              list: [
                                  { code: 356, parameters: ['D_TEXT \\C[8]所持数：\\V[418] 28'] },
                                  { code: 356, parameters: ['D_TEXT \\C[8]所持数：\\V[424] 28'] },
                              ],
                          },
                      ]
                    : [
                          null,
                          {
                              note: '<hint:AVデビューさせよう！>\n<noteValue:【シーン】何もかも\n失った夜>\n<plus:我慢が5%上昇>\n<minus:すばやさが5%低下>\n<picture:asset_name>\n<common:277>\n<真宮>',
                          },
                      ],
        }))
    );
    const translator = new SeedPresserUITranslator();
    expect(translator.detectPlugin()).toBe(true);
    await translator.precomputeCounts();
    expect([...translator.entries.keys()]).toEqual(
        expect.arrayContaining([
            'AVデビューさせよう！',
            '【シーン】何もかも\n失った夜',
            '我慢が5%上昇',
            'すばやさが5%低下',
        ])
    );
    expect(translator.entries.has('asset_name')).toBe(false);
    expect(translator.entries.has('277')).toBe(false);
    expect(translator.entries.has('所持数：')).toBe(true);
    const quantity = translator.templates.find((entry) => entry.text.startsWith('所持数：'));
    expect(quantity.pattern.test('所持数：1')).toBe(true);
    expect(quantity.pattern.test('所持数：124')).toBe(true);
    const values = new Map([
        [quantity.text, 'Qty: \\COT[0]'],
        ['我慢が5%上昇', 'Endurance +5%'],
    ]);
    const runtime = {
        getCacheKey: (value) => value,
        hasUsableCacheValue: (key) => values.has(key),
        translationCache: values,
        trackCacheKeyUsage: vi.fn(),
    };
    translator.isRuntimeTranslationActive = () => true;
    translator.prepareDynamicValueTag = () => {};
    expect(translator.resolveText('所持数：4', runtime)).toBe('Qty: 4');
    expect(translator.resolveText('我慢が5%上昇 / すばやさが5%低下', runtime)).toContain(
        'Endurance +5%'
    );
    plugin.parameters.Scene1 = JSON.stringify({ Id: 'Unrelated' });
    expect(translator.detectPlugin()).toBe(false);
});
