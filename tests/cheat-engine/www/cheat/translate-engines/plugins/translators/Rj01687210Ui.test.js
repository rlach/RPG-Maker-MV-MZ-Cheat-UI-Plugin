import { afterEach, expect, it, vi } from 'vitest';
import { SrpgCoreTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SrpgCoreTranslator.js';
import { SrpgBattlePrepareTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SrpgBattlePrepareTranslator.js';
import { SimpleEquipUpgradeTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SimpleEquipUpgradeTranslator.js';
vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function setup(Translator, name, parameters, source, pairs) {
    vi.stubGlobal('window', {
        $plugins: [{ name, status: true, parameters }],
        $dataCommonEvents: [
            {
                list: [
                    {
                        code: 357,
                        parameters: [
                            'SRPG_core_MZ',
                            'winLoseCondition',
                            '',
                            { key: 'win', text: '・敵全滅' },
                        ],
                    },
                ],
            },
        ],
        $dataMapInfos: [],
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => ({
            ok: true,
            text: async () =>
                url === 'data/Enemies.json'
                    ? JSON.stringify([null, { note: '<srpgClass:女匪npc><srpgMove:3>' }])
                    : source,
        }))
    );
    const translator = new Translator();
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map(
            pairs.map(([text, value]) => [translator.getCacheType() + ':' + text, value])
        ),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    return { translator, runtime };
}
it('catalogs SRPG vocabulary, event conditions and enemy class metadata before observation', async () => {
    const { translator, runtime } = setup(
        SrpgCoreTranslator,
        'SRPG_core_MZ',
        {
            textSrpgWait: '待機',
            textSrpgWinCondition: '勝利条件',
            BattleBasicParam: 'Internal heading',
        },
        '',
        [
            ['待機', 'Wait'],
            ['女匪npc', 'Bandit'],
            ['・敵全滅', 'Defeat all enemies'],
        ]
    );
    await translator.precomputeCounts();
    expect(translator.resolveText('待機', runtime)).toBe('Wait');
    expect(translator.resolveText('女匪npc', runtime)).toBe('Bandit');
    expect(translator.resolveText('・敵全滅', runtime)).toBe('Defeat all enemies');
    expect(translator.entries.has('Internal heading')).toBe(false);
    expect(translator.entries.has('3')).toBe(false);
    expect(translator.collectUntranslated({ runtime }).map((item) => item.value)).toContain(
        '勝利条件'
    );
    expect(window.$dataCommonEvents[0].list[0].parameters[3].text).toBe('・敵全滅');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_srpg_core:女匪npc',
        expect.anything()
    );
});
it('catalogs deployment labels without translating participant limits', async () => {
    const { translator, runtime } = setup(
        SrpgBattlePrepareTranslator,
        'SRPG_BattlePrepare_MZ',
        { textBattlerNumber: '参加人数', textFinishPrepare: '戦闘開始', maxActor: '1' },
        '',
        [['参加人数', 'Participants']]
    );
    await translator.precomputeCounts();
    expect(translator.resolveText('参加人数', runtime)).toBe('Participants');
    expect(translator.resolveText('1 / 1', runtime)).toBe('1 / 1');
    expect(translator.entries.has('1')).toBe(false);
});
it('translates upgrade costs and static labels with source-key tracking', async () => {
    const { translator, runtime } = setup(
        SimpleEquipUpgradeTranslator,
        'SimpleEquipUpgrade',
        {},
        "this.drawText('持有 ' + gold + ' G',0,0);this.drawText('成功率',0,0);this.drawText('锁',0,0);",
        [
            ['持有 \\COT[0] G', 'Owned: \\COT[0] G'],
            ['成功率', 'Success rate'],
        ]
    );
    await translator.precomputeCounts();
    expect(translator.resolveText('持有 40540 G', runtime)).toBe('Owned: 40540 G');
    expect(translator.resolveText('成功率', runtime)).toBe('Success rate');
    expect(translator.entries.has('锁')).toBe(true);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_simple_equip_upgrade:持有 \\COT[0] G',
        expect.anything()
    );
});
