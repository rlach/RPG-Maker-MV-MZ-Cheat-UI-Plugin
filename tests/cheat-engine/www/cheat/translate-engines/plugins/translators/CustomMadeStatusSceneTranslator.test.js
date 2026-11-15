import { afterEach, expect, it, vi } from 'vitest';
import { CustomMadeStatusSceneTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/CustomMadeStatusSceneTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('extracts nested labels, defaults and all configured values without technical identifiers', async () => {
    const config = JSON.stringify({
        numbers1: JSON.stringify([JSON.stringify({ itemId: 'var1', label: '経験人数' })]),
        strings: JSON.stringify([
            JSON.stringify({
                itemId: 'var9',
                label: '初めての相手',
                default: '未定',
                values: JSON.stringify(['触手', 'スライム']),
            }),
        ]),
    });
    vi.stubGlobal('window', {
        $plugins: [{ name: 'CustomMadeStatusScene', parameters: { ItemConfig: config } }],
    });
    const t = new CustomMadeStatusSceneTranslator();
    await t.collectAdditionalTexts();
    expect([...t.entries.keys()]).toEqual(['経験人数', '初めての相手', '未定', '触手', 'スライム']);
});
it('translates copies of presentation data and never harvests translated core parameter labels', () => {
    const data = { label: '初めての相手', text: '触手' };
    class Status {
        stringItemData() {
            return data;
        }
        numberItemData() {
            return { label: 'Attack', value: 36 };
        }
    }
    vi.stubGlobal('window', { Window_Status: Status });
    const t = new CustomMadeStatusSceneTranslator();
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => true,
        translationCache: new Map([
            ['初めての相手', 'First Partner'],
            ['触手', 'Tentacles'],
        ]),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    const status = new Status();
    for (let i = 0; i < 2; i++)
        expect(status.stringItemData({ label: data.label })).toEqual({
            label: 'First Partner',
            text: 'Tentacles',
        });
    expect(status.numberItemData({ label: '' })).toEqual({ label: 'Attack', value: 36 });
    expect(data).toEqual({ label: '初めての相手', text: '触手' });
    expect(r.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual([
        '初めての相手',
        '触手',
        '初めての相手',
        '触手',
    ]);
});
