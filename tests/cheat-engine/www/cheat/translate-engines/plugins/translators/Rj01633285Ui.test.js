import { afterEach, expect, it, vi } from 'vitest';
import { YepItemSynthesisTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/YepItemSynthesisTranslator.js';
import { AyatamSceneCustomTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/AyatamSceneCustomTranslator.js';
import { MppSmoothBattleLogTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MppSmoothBattleLogTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('catalogs crafting labels from configured values without collecting gameplay flags', async () => {
    vi.stubGlobal('window', { $plugins: [] });
    const t = new YepItemSynthesisTranslator();
    t.getSourcePluginNames = () => [];
    t.collectParameterTexts({
        'Crafted Items': '作ったポーション',
        'Ingredients Text': '材料リスト',
        'Amount Text': '数量',
        'Enable Command': 'true',
    });
    await t.buildCatalog();
    expect([...t.entries.keys()]).toEqual(['作ったポーション', '材料リスト', '数量']);
});
it('parses nested drawing scripts while keeping expressions intact', async () => {
    vi.stubGlobal('window', { $plugins: [] });
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '' }));
    const t = new AyatamSceneCustomTranslator();
    t.getSourcePluginNames = () => [];
    await t.buildCatalog();
    const params = {
        windows: JSON.stringify([
            JSON.stringify({
                standardDrawList: JSON.stringify([
                    'this.mmcDrawTextEx(index,"返済まで\\\\V[24]日",0,0);',
                ]),
            }),
        ]),
    };
    const snapshot = JSON.stringify(params);
    t.collectParameterTexts(params);
    await t.buildCatalog();
    expect(t.entries.has('返済まで\\V[24]日')).toBe(true);
    expect(JSON.stringify(params)).toBe(snapshot);
});
it('collects battle scripts into message keys and translates notices before log expansion', async () => {
    class Log {
        addText(text) {
            return text;
        }
    }
    vi.stubGlobal('window', { Window_BattleLog: Log, $plugins: [] });
    const t = new MppSmoothBattleLogTranslator();
    t.shouldScanEventData = () => false;
    await t.buildCatalog();
    t.collectCommandTexts([
        {
            code: 355,
            parameters: [
                "BattleManager._logWindow.addText('\\\\C[18]ムラムラゲージ＋\\\\V[193]');",
            ],
        },
    ]);
    const source = '\\C[18]ムラムラゲージ＋\\V[193]';
    expect(t.entries.has(source)).toBe(true);
    expect(t.getCacheType()).toBe('message');
    const r = {
        isTranslationEnabled: () => true,
        getPreferredMessageCacheEntry: (text) =>
            text === source ? { value: '\\C[18]Arousal +\\V[193]' } : null,
        getMessageCacheKey: (text) => 'message:' + text,
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Log().addText(source)).toBe('\\C[18]Arousal +\\V[193]');
});
