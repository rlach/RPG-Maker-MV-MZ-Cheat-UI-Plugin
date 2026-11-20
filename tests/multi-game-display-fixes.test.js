import { afterEach, expect, it, vi } from 'vitest';
import {
    ItemSortTranslator,
    EnemyAnalysisSkillTranslator,
    ExtraGaugeTextTranslator,
    TinyGetInfoTranslator,
} from '../cheat-engine/www/cheat/translate-engines/plugins/translators/AdditionalDisplayUiTranslators.js';
import { CategorySynthesisTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/CategorySynthesisTranslator.js';
import { NuunSaveScreen3Translator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/NuunSaveScreen3Translator.js';
import { TorigoyaNotifyMessageTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/TorigoyaNotifyMessageTranslator.js';
import { MppSmoothBattleLogTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MppSmoothBattleLogTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function runtime(entries = []) {
    const r = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (s, t) => `${t}:${s}`,
        translationCache: new Map(entries),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
        engine: { addPluginTags: vi.fn() },
    };
    return r;
}

it('catalogs item sort, analysis labels and nested battle gauge labels', () => {
    const sort = new ItemSortTranslator();
    sort.collectParameterTexts({ SortIdText: 'ID順（shiftで切り替え）', SortKey: 'id' });
    expect(sort.entries.has('ID順（shiftで切り替え）')).toBe(true);
    expect(sort.entries.has('id')).toBe(false);
    const analysis = new EnemyAnalysisSkillTranslator();
    analysis.collectParameterTexts({ labelAtk: '攻撃', labelMdf: '魔防', skillId: '5' });
    expect([...analysis.entries.keys()]).toEqual(['攻撃', '魔防']);
    analysis.collectParameterTexts({ labelLuk: '運' });
    const r = runtime([['plugin_enemy_analysis:運', 'Luck']]);
    analysis.registerPluginCustomTags = () => {};
    expect(analysis.resolveText('\\C[0] 運:30', r)).toBe('\\C[0] Luck:30');
    expect(analysis.resolveText('幸運な名前', r)).toBe('幸運な名前');
    const gauge = new ExtraGaugeTextTranslator();
    gauge.collectParameterTexts({
        BattleLayout: JSON.stringify([
            JSON.stringify({ ParamName: '服耐久', DetaEval: '$gameVariables.value(6)' }),
        ]),
    });
    expect([...gauge.entries.keys()]).toEqual(['服耐久']);
});

it('reuses complete item descriptions but harvests TinyGetInfo alternate info metadata', async () => {
    const item = { description: '原文一行\n二行', meta: { info: '別の通知説明' } };
    vi.stubGlobal('window', { $dataItems: [null, item] });
    const t = new TinyGetInfoTranslator();
    await t.collectAdditionalTexts();
    const r = runtime([['item_description:原文一行\n二行', 'First line\nSecond line']]);
    expect(t.entries.has('別の通知説明')).toBe(true);
    expect(t.resolveText('原文一行', r)).toBe('First line');
    expect(item.description).toBe('原文一行\n二行');
});

it('translates parenthesized cooking categories while leaving category identity untouched', () => {
    vi.stubGlobal('window', {});
    const t = new CategorySynthesisTranslator();
    const r = runtime([
        ['command:鳥肉', 'Poultry'],
        ['plugin_category_synthesis:基準売価', 'Base selling price'],
    ]);
    expect(t.translateKnownPluginText(r, '(鳥肉)')).toBe('(Poultry)');
    expect(t.translateKnownPluginText(r, '基準売価')).toBe('Base selling price');
    expect(t.translateKnownPluginText(r, '(Unknown)')).toBe('(Unknown)');
});

it('translates saved location through map_name without changing save info or layout parameters', () => {
    class Base {
        nuun_DrawSaveContentsLcation(info, ...args) {
            return [info, ...args];
        }
    }
    class Saves {
        drawSystemText() {}
    }
    vi.stubGlobal('window', { Window_Base: Base, Window_SavefileList: Saves });
    const t = new NuunSaveScreen3Translator();
    const r = runtime([['map_name:波須戸市', 'Hasudo City']]);
    t.getRuntime = () => r;
    t.enablePluginTranslation();
    const info = { mapname: '波須戸市', timestamp: 10 };
    expect(new Base().nuun_DrawSaveContentsLcation(info, 1, 2, 3, {})).toEqual([
        { mapname: 'Hasudo City', timestamp: 10 },
        1,
        2,
        3,
        {},
    ]);
    expect(info.mapname).toBe('波須戸市');
    r.enabled = false;
    expect(new Base().nuun_DrawSaveContentsLcation(info)[0]).toBe(info);
});

it('harvests notification values authored in variable expressions before they are seen', async () => {
    const t = new TorigoyaNotifyMessageTranslator();
    expect(t.dynamicTexts.getPluginName()).toBe(t.getPluginName());
    const list = [
        { code: 122, parameters: [21, 21, 0, 4, '"\\\\I[84]淫欲 +" + $gameVariables.value(22)'] },
        {
            code: 357,
            parameters: ['TorigoyaMZ_NotifyMessage', 'notify', '', { message: '\\V[21]' }],
        },
    ];
    t.collectNotifyCommandsFromList(list, {}, []);
    await t.dynamicTexts.buildCatalog();
    const entry = [...t.dynamicTexts.entries.values()].find((e) => e.parts);
    expect(entry.text).toContain('淫欲');
    const r = runtime([['plugin_torigoya_notify_message:' + entry.text, '\\I[84]Lust +\\COT[0]']]);
    t.dynamicTexts.registerPluginCustomTags = vi.fn();
    t._scanEntries = [...t.dynamicTexts.entries.values()];
    expect(t.buildUniquePendingItems(r).some((item) => item.value === entry.text)).toBe(true);
    expect(t.dynamicTexts.registerPluginCustomTags).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ tagSymbol: 'COT' })])
    );
    expect(t.translateRuntimeText('\\I[84]淫欲 +15', r)).toBe('\\I[84]Lust +15');
});

it('normalizes script-authored ESC colors to protected notification cache tags', async () => {
    const t = new TorigoyaNotifyMessageTranslator();
    const value = String.fromCharCode(27) + 'C[27]淫欲 +15';
    t.collectNotifyCommandsFromList(
        [
            { code: 122, parameters: [21, 21, 0, 4, JSON.stringify(value)] },
            {
                code: 357,
                parameters: ['TorigoyaMZ_NotifyMessage', 'notify', '', { message: '\\V[21]' }],
            },
        ],
        {},
        []
    );
    await t.dynamicTexts.buildCatalog();
    expect(t.dynamicTexts.entries.has('\\C[27]淫欲 +15')).toBe(true);
    const r = runtime([['plugin_torigoya_notify_message:\\C[27]淫欲 +15', '\\C[27]Lust +15']]);
    t.dynamicTexts.registerPluginCustomTags = () => {};
    expect(t.translateRuntimeText(value, r)).toBe('\\C[27]Lust +15');
});

it('translates BattleLogOutput before native actor expansion without changing command data', () => {
    class Log {
        addText(text) {
            this.text = text;
        }
    }
    vi.stubGlobal('window', {
        Window_BattleLog: Log,
        PluginManager: {
            callCommand(interpreter, plugin, command, args) {
                interpreter.addText(args.message.replace(/\\N\[1\]/g, 'Hina'));
            },
        },
    });
    const source = '身体がとても小さい\\N[1]は見えない。';
    const t = new MppSmoothBattleLogTranslator();
    const r = runtime();
    r.getPreferredMessageCacheEntry = (text) =>
        text === source ? { value: 'Tiny \\N[1] cannot be seen.' } : null;
    t.getRuntime = () => r;
    t.enablePluginTranslation();
    t.collectCommandTexts([
        { code: 357, parameters: ['BattleLogOutput', 'OUTPUT_LOG', '', { message: source }] },
    ]);
    expect(t.entries.has(source)).toBe(true);
    const log = new Log();
    const args = { message: source, waitCount: '0' };
    window.PluginManager.callCommand(log, 'BattleLogOutput', 'OUTPUT_LOG', args);
    expect(log.text).toBe('Tiny Hina cannot be seen.');
    expect(args.message).toBe(source);
});
