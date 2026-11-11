import { afterEach, expect, it, vi } from 'vitest';
import { CeliaDungeonUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/CeliaDungeonUiTranslator.js';
import { GetInformationTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/GetInformationTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('catalogs generated equipment components, custom labels and reward templates without mutating game data', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$dataMapInfos', []);
    vi.stubGlobal('$dataCommonEvents', [
        {
            list: [
                { code: 122, parameters: [923, 923, 0, 4, "'中古の'"] },
                { code: 122, parameters: [933, 933, 0, 4, "'ガラス'"] },
                {
                    code: 357,
                    parameters: [
                        'LightweightToast',
                        'showStates',
                        '',
                        { title: '睡眠ボーナスステート！' },
                    ],
                },
            ],
        },
    ]);
    vi.stubGlobal('$plugins', [
        { name: 'FastEnchantSystem', status: true, parameters: {} },
        { name: 'LightweightToast', status: true, parameters: {} },
        {
            name: 'NYA_FTKR_ItemSubCommand',
            status: true,
            parameters: {
                'Command Use Format': '使う',
                'Command Discard Format': '捨てる',
                'Command Cancel Format': 'やめる',
            },
        },
        {
            name: 'Patch_ItemSubCommand_Hotbar',
            status: true,
            parameters: { 'Hotbar Command Name': 'ショートカット登録' },
        },
        {
            name: 'ManoUZ_MessageLogOption',
            status: true,
            parameters: { optionText: 'メッセージログ設定', keepAutoMode: 'オート維持' },
        },
        {
            name: 'MPP_EquipStatusEX',
            status: true,
            parameters: { 'Terms Sparams': JSON.stringify({ exr: '経験獲得率' }) },
        },
        {
            name: 'NUUN_RandomItems',
            status: true,
            parameters: { GetTextMessage: '%1を手に入れた！' },
        },
    ]);
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => ({
            ok: true,
            text: async () =>
                path === 'data/Skills.json'
                    ? JSON.stringify([null, { note: '<NameType:ガードナー>' }])
                    : '',
        }))
    );
    const translator = new CeliaDungeonUiTranslator();
    await translator.precomputeCounts();
    for (const text of [
        '中古の',
        '使う',
        '捨てる',
        'やめる',
        'ショートカット登録',
        'ガラス',
        'ガードナー',
        'メッセージログ設定',
        'オート維持',
        '経験獲得率',
        '睡眠ボーナスステート！',
        '\\COT[0]を手に入れた！',
    ])
        expect(translator.entries.has(text), text).toBe(true);
    const runtime = {
        isTranslationEnabled: () => true,
        engine: {},
        getCacheKey: (text) => text,
        translationCache: new Map([
            ['中古の', 'Used '],
            ['ガラス', 'Glass '],
            ['ガードナー', 'Guard'],
            ['\\COT[0]を手に入れた！', 'Obtained \\COT[0]!'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    translator.tagEngine = runtime.engine;
    const equipment = { Name: '中古のガラスガードナー' };
    expect(translator.resolveText(equipment.Name, runtime)).toBe('Used Glass Guard');
    expect(translator.resolveText('★Glass Shoesを手に入れた！', runtime)).toBe(
        'Obtained ★Glass Shoes!'
    );
    expect(equipment.Name).toBe('中古のガラスガードナー');
    runtime.isTranslationEnabled = () => false;
    expect(translator.resolveText(equipment.Name, runtime)).toBe(equipment.Name);
});

it('recognizes the SKM MZ popup port and collects its actual parameter values', () => {
    vi.stubGlobal('window', globalThis);
    const parameters = { 'Exp Up Text': '_actorは_numポイントの_nameを得た！' };
    vi.stubGlobal('$plugins', [
        { name: 'SKM_GetInformationMZ', status: true, parameters },
        { name: 'SKM_CommonPopupCoreMZ', status: true, parameters: {} },
    ]);
    vi.stubGlobal('PluginManager', { parameters: vi.fn(() => parameters) });
    const translator = new GetInformationTranslator();
    expect(translator.detectPlugin()).toBe(true);
    expect(translator.getSourceTextByField().get('Exp Up Text')).toBe(parameters['Exp Up Text']);
    expect(PluginManager.parameters).toHaveBeenCalledWith('SKM_GetInformationMZ');
});
