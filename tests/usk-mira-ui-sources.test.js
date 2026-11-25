import { it, expect, vi, afterEach } from 'vitest';
import { UskMiraUiTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/UskMiraUiTranslator.js';
import { extractJavaScriptTextCatalog } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('collects profile text while excluding actual filename declarations', () => {
    const { entries } = extractJavaScriptTextCatalog(
        'const TEXT_PROFILE={fullName:"ミラセティ",normal:["冒険者のプロフィール"]};const IMAGE_FILE="画像";const TEXT_FILE_NAME="ファイル";'
    );
    expect(entries.map((e) => e.text)).toEqual(
        expect.arrayContaining(['ミラセティ', '冒険者のプロフィール'])
    );
    expect(entries.map((e) => e.text)).not.toContain('画像');
    expect(entries.map((e) => e.text)).not.toContain('ファイル');
});
it('collects typed original resources and resolves local armor variants without new source keys', async () => {
    vi.stubGlobal('window', globalThis);
    const source = { name: '白い下着', description: '普段使いの下着' };
    const sources = {
        'data/MapInfos.json': [],
        'data/Actors.json': [{ name: 'ミラ' }],
        'data/Items.json': [],
        'data/Weapons.json': [],
        'data/Armors.json': [null, source],
        'data/CommonEvents.json': [
            null,
            {
                list: [
                    { code: 108, parameters: ['<eventNotice:魔物の気配はしないようだ……>'] },
                    { code: 122, parameters: [1, 1, 0, 4, '"宝箱は鉄で作られている"'] },
                    {
                        code: 355,
                        parameters: ['USKLOG.addLog(name + "はMPを " + cost + " 消費した！");'],
                    },
                ],
            },
        ],
        'js/plugins/UskCsvLoader.js': '',
        'js/plugins/UskMiraTerms.js': 'const TERMS={guts:"根性"};',
        'js/plugins/SceneCustomMenuEx.js': 'const TEXT_GALLERY="シーン回収率";',
        'data/unique/tips.csv': 'native CSV fixture',
    };
    vi.stubGlobal('$plugins', [
        { name: 'UskMiraTerms', status: true, parameters: {} },
        { name: 'SceneCustomMenuEx', status: true, parameters: {} },
        { name: 'UskCsvLoader', status: true, parameters: { csvFiles: '["unique/tips"]' } },
        {
            name: 'TextScriptBase',
            status: true,
            parameters: {
                TextList: JSON.stringify([
                    JSON.stringify({ Id: 'chara_guild', Text: 'アルヘナ' }),
                    JSON.stringify({
                        Id: 'town_guild',
                        Text: '(() => {return "冒険者ギルド";})()',
                    }),
                    JSON.stringify({ Id: 'type_adv', Text: '[冒険用アイテム]' }),
                ]),
            },
        },
    ]);
    vi.stubGlobal('CsvImportor', { parseFromCSV: () => [['attack', '一行目\n二行目']] });
    vi.stubGlobal('fetch', async (url) => {
        if (!(url in sources)) throw Error(url);
        return { ok: true, text: async () => sources[url], json: async () => sources[url] };
    });
    const t = new UskMiraUiTranslator();
    await t.precomputeCounts();
    const pending = t.getPendingSourceEntries();
    expect(pending).toContainEqual({ type: 'speaker', value: 'アルヘナ' });
    expect(pending).toContainEqual({ type: 'message', value: '宝箱は鉄で作られている' });
    expect(pending).toContainEqual({ type: 'armor_name', value: '白い下着' });
    expect(t.textResources.get('attack')).toBe('一行目\n二行目');
    expect(t.entries.has('魔物の気配はしないようだ……')).toBe(true);
    expect(t.entries.has('冒険者ギルド')).toBe(true);
    const template = [...t.entries.values()].find((e) => e.parts && e.text.includes('はMPを'));
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map([
            ['armor_name:白い下着', 'White Underwear'],
            ['plugin_usk_mira_ui:' + template.text, '\\COT[0] spent \\COT[1] MP!'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    for (let i = 1; i <= 100; i++) {
        expect(t.resolveText('白い下着+' + i, runtime)).toBe('White Underwear+' + i);
        expect(t.resolveText('MiraはMPを ' + i + ' 消費した！', runtime)).toBe(
            'Mira spent ' + i + ' MP!'
        );
    }
    expect(t.resolveText('White Underwear+1', runtime)).toBe('White Underwear+1');
    expect(source).toEqual({ name: '白い下着', description: '普段使いの下着' });
    expect(
        runtime.trackCacheKeyUsage.mock.calls.every(
            ([key]) => !key.includes('White Underwear') && !key.includes('MiraはMPを')
        )
    ).toBe(true);
    runtime.enabled = false;
    expect(t.resolveText('白い下着+1', runtime)).toBe('白い下着+1');
});
