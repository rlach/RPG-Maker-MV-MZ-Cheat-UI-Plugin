import { afterEach, expect, it, vi } from 'vitest';
import { SoRGabWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SoRGabWindowTranslator.js';
import { SceneCustomMenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SceneCustomMenuTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('scans both notification lines and translates before command execution without mutating arguments', () => {
    vi.stubGlobal('window', globalThis);
    const original = vi.fn();
    vi.stubGlobal('PluginManager', { callCommand: original });
    const translator = new SoRGabWindowTranslator();
    const args = { arg0: '0', arg1: 'もう着ているわ|二行目' };
    translator.collectCommandTexts([
        { code: 357, parameters: [translator.getPluginName(), 'PushGab', '', args] },
    ]);
    expect([...translator.entries.keys()]).toEqual(['もう着ているわ', '二行目']);
    const seen = [];
    translator.getRuntime = () => ({
        enabled: true,
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: (key) => seen.push(key),
        hasUsableCacheValue: () => true,
        translationCache: new Map([
            ['もう着ているわ', 'Already dressed.'],
            ['二行目', 'Second line.'],
        ]),
    });
    expect(translator.enablePluginTranslation()).toBe(true);
    PluginManager.callCommand({}, translator.getPluginName(), 'PushGab', args);
    expect(original.mock.calls[0][3].arg1).toBe('Already dressed.|Second line.');
    expect(args.arg1).toBe('もう着ているわ|二行目');
    expect(seen).toEqual(['もう着ているわ', '二行目']);
});

it('includes database metadata displayed by custom menu scripts in mass translation', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        {
            name: 'SceneCustomMenu',
            parameters: {
                Scene1: JSON.stringify({
                    Id: 'travel',
                    WindowList: JSON.stringify([
                        JSON.stringify({
                            ItemDrawScript: JSON.stringify([
                                "this.drawTextEx(`${item.meta['MapText']}`, 0, 0);",
                            ]),
                        }),
                    ]),
                }),
            },
        },
    ]);
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            json: async () => [
                null,
                { id: 7, note: '<warp1>\n<MapText:教会で主人公が借りている部屋>' },
            ],
        }))
    );
    const translator = new SceneCustomMenuTranslator();
    translator._loadActorSourceNames = async () => {};
    const entries = await translator.buildScanEntries();
    expect(entries.some((entry) => entry.text === '教会で主人公が借りている部屋')).toBe(true);
    expect(entries.some((entry) => entry.text === 'warp1')).toBe(false);
});
