import { afterEach, expect, it, vi } from 'vitest';
import { AbilitySystemTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/AbilitySystemTranslator.js';
import { PHWarehouseTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/PHWarehouseTranslator.js';
import { LevelUpMessagePlusTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LevelUpMessagePlusTranslator.js';
import { DarkPlasmaChoiceExtensionTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DarkPlasmaChoiceExtensionTranslator.js';
import { DestinationWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DestinationWindowTranslator.js';
import { NUUN_EnemyBookTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NUUN_EnemyBookTranslator.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('collects ability labels and warehouse titles without translating identifiers', () => {
    const ability = new AbilitySystemTranslator();
    ability.collectParameterTexts({ Text: JSON.stringify({ CostText: 'コスト：' }) });
    expect(ability.entries.has('コスト：')).toBe(true);
    const warehouse = new PHWarehouseTranslator();
    warehouse.collectCommandTexts([
        { code: 357, parameters: ['PH_Warehouse_MZ', 'Show', '', { title: '倉庫' }] },
    ]);
    expect([...warehouse.entries.keys()]).toEqual(['倉庫']);
    const choices = new DarkPlasmaChoiceExtensionTranslator();
    choices.collectCommandTexts([
        { code: 102, parameters: [['en(s[101])スライム討伐', 'if(v[3]>0)帰る']] },
    ]);
    expect([...choices.entries.keys()]).toEqual(['スライム討伐', '帰る']);
});

it('builds stable level-up templates including comparison values', async () => {
    const translator = new LevelUpMessagePlusTranslator();
    vi.spyOn(translator, 'findPluginEntry').mockReturnValue({ parameters: {} });
    await translator.collectAdditionalTexts();
    const entry = translator.entries.get('\\COT[0] が \\COT[1] 上がった！\\COT[2]');
    expect(entry.parts).toEqual(['', ' が ', ' 上がった！', '']);
});

it('scans enemy book pages, defeated label and note descriptions', () => {
    vi.stubGlobal('window', globalThis);
    const translator = new NUUN_EnemyBookTranslator();
    vi.spyOn(translator, 'findPluginEntry').mockReturnValue({
        parameters: { ListData: JSON.stringify([{ paramName: '説明' }]) },
    });
    const entries = translator.buildScanEntries([{ id: 1, note: '<desc1:半透明のモンスター>' }]);
    expect(entries.map((e) => e.text)).toEqual(
        expect.arrayContaining(['説明', '倒した数', '半透明のモンスター'])
    );
});

it('keeps destination variable templates through native MZ argument expansion', () => {
    vi.stubGlobal('window', globalThis);
    class System {
        setDestination(text) {
            this.lines = text.split('\n');
        }
        getDestination() {
            return this.lines;
        }
    }
    let turn = 'Mark';
    class Base {
        convertEscapeCharacters(text) {
            return text.replace(/\\v\[60\]/gi, turn);
        }
    }
    class Interpreter {
        command357(params) {
            $gameSystem.setDestination(new Base().convertEscapeCharacters(params[3].destination));
            return true;
        }
    }
    vi.stubGlobal('Game_System', System);
    vi.stubGlobal('Game_Interpreter', Interpreter);
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('$gameSystem', new System());
    const translator = new DestinationWindowTranslator();
    const key = 'plugin_destination_window:ターン：\\v[60]';
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (s, t) => t + ':' + s,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (k) => k === key,
        translationCache: new Map([[key, 'Turn: \\v[60]']]),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    translator.enablePluginTranslation();
    new Interpreter().command357([
        'DestinationWindow',
        'SET_DESTINATION',
        '',
        { destination: 'ターン：\\v[60]' },
    ]);
    expect($gameSystem.getDestination()).toEqual(['Turn: Mark']);
    turn = 'Phyllis';
    expect($gameSystem.getDestination()).toEqual(['Turn: Phyllis']);
    expect($gameSystem.lines).toEqual(['ターン：Mark']);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(key, { harvestMissing: false });
    runtime.enabled = false;
    expect($gameSystem.getDestination()).toEqual(['ターン：Mark']);
});
