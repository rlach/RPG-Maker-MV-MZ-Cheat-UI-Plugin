import { afterEach, expect, it, vi } from 'vitest';
import { YepBattleEngineCoreTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/YepBattleEngineCoreTranslator.js';
import { CbrEroStatusMvTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/CbrEroStatusMvTranslator.js';
import { RecollectionRoomTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/RecollectionRoomTranslator.js';
import { CallEnemyTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/CallEnemyTranslator.js';
import { isVariableDisplayContext } from '../cheat-engine/www/cheat/js/translation-runtime/VariableDisplayContext.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('YepBattleEngineCoreTranslator translates selection help texts and <Display Text> notetags without harvesting translated command names', async () => {
    class Window_Help {
        drawSpecialSelectionText() {
            return [
                window.Yanfly.Param.BECHelpUserTx,
                window.Yanfly.Param.BECHelpEnemiesTx,
                window.Yanfly.Param.BECHelpAllTx,
            ];
        }
    }

    class Window_BattleLog {
        displayText(item) {
            return item?.battleDisplayText || '';
        }
    }

    const yanflyParam = {
        BECHelpUserTx: 'イヴリィ',
        BECHelpAllyTx: 'Ally',
        BECHelpAlliesTx: 'Allies',
        BECHelpEnemyTx: 'Enemy',
        BECHelpEnemiesTx: '全体',
        BECHelpAllTx: '全体',
        BECHelpRandTx: '%2 Random %1',
    };

    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'YEP_BattleEngineCore',
                status: true,
                parameters: {
                    'Action Speed': 'agi',
                    'Default System': 'dtb',
                    'Command Alignment': 'center',
                    'User Help Text': 'イヴリィ',
                    'Ally Help Text': 'Ally',
                    'Allies Help Text': 'Allies',
                    'Enemy Help Text': 'Enemy',
                    'Enemies Help Text': '全体',
                    'All Help Text': '全体',
                    'Random Help Text': '%2 Random %1',
                },
            },
        ],
        $dataSkills: [
            null,
            {
                id: 1,
                name: 'Strike',
                battleDisplayText: '攻撃',
                note: '<Display Text: 必殺斬り>',
                _translateOriginal: {
                    name: '攻撃',
                    note: '<Display Text: 必殺斬り>',
                },
            },
        ],
        $dataItems: [null],
        Yanfly: { Param: yanflyParam },
        Window_Help,
        Window_BattleLog,
    });

    const cache = new Map([
        ['actor_name:イヴリィ', 'Evry'],
        ['plugin_yep_battle_engine_core:全体', 'All Enemies'],
        ['plugin_yep_battle_engine_core:必殺斬り', 'Deadly Slash'],
    ]);
    const harvested = [];
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: cache,
        hasUsableCacheValue: (key) => cache.has(key) && !!cache.get(key),
        trackCacheKeyUsage: vi.fn((key, options) => {
            if (options?.harvestMissing !== false) {
                harvested.push(key);
            }
        }),
    };

    const translator = new YepBattleEngineCoreTranslator();
    translator.getRuntime = () => runtime;

    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();

    const scanValues = translator._scanEntries.map((e) => e.text);
    // Technical params like 'dtb', 'center' must NOT be collected
    expect(scanValues).not.toContain('dtb');
    expect(scanValues).not.toContain('center');
    expect(scanValues).toContain('イヴリィ');
    expect(scanValues).toContain('全体');
    expect(scanValues).toContain('必殺斬り');

    const helpWin = new Window_Help();
    expect(helpWin.drawSpecialSelectionText()).toEqual(['Evry', 'All Enemies', 'All Enemies']);
    // Original Yanfly.Param values are restored after drawSpecialSelectionText
    expect(yanflyParam.BECHelpUserTx).toBe('イヴリィ');

    const battleLog = new Window_BattleLog();
    const customSkill = {
        id: 1,
        name: 'Strike',
        battleDisplayText: '必殺斬り',
        _translateOriginal: { name: '攻撃' },
    };
    expect(battleLog.displayText(customSkill)).toBe('Deadly Slash');

    // Standard skill where battleDisplayText defaulted to original Japanese name before DataObjects translated item.name
    const standardSkill = {
        id: 2,
        name: 'Attack',
        battleDisplayText: '攻撃',
        _translateOriginal: { name: '攻撃' },
    };
    expect(battleLog.displayText(standardSkill)).toBe('Attack');
    expect(harvested).not.toContain('plugin_yep_battle_engine_core:Attack');
});

it('CbrEroStatusMvTranslator translates expanded \\V[126] variable values in Window_EroStatus without harvesting raw "\\V[126]" template', () => {
    const drawnTexts = [];
    const measuredTexts = [];

    class Window_EroStatus {
        constructor() {
            this._complete = false;
            this.contents = {
                context: {
                    measureText: (txt) => {
                        measuredTexts.push(txt);
                        return { width: txt.length * 10 };
                    },
                },
                drawText: (txt) => {
                    drawnTexts.push(txt);
                },
            };
        }
        CBR_complete() {
            return this._complete;
        }
        update() {
            const val = window.$gameVariables.value(126);
            this.contents.context.measureText(val);
            this.contents.drawText(val, 400, 282, 100, 0, 'left');
            this._complete = true;
        }
    }

    vi.stubGlobal('window', {
        Utils: { RPGMAKER_NAME: 'MV' },
        $plugins: [
            { name: 'CBR_eroStatus_main', status: true, parameters: {} },
            {
                name: 'CBR_eroStatus_1',
                status: true,
                parameters: {
                    txtSubject_1: '\\V[126]',
                    txtSubject_2: '経験人数',
                },
            },
        ],
        CBR_eroStatus: [
            {
                p: [],
                t: [{ subject: '\\V[126]', show: true }, { subject: '経験人数', show: true }],
            },
        ],
        $gameVariables: {
            value: (id) => {
                if (id === 126) {
                    return isVariableDisplayContext() ? 'Virgin (Var)' : '処女';
                }
                return 0;
            },
        },
        Window_EroStatus,
    });

    const cache = new Map([
        ['plugin_cbr_erostatus_mv:経験人数', 'Partners'],
        ['variable_value:処女', 'Virgin'],
    ]);
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: cache,
        hasUsableCacheValue: (key) => cache.has(key) && !!cache.get(key),
        trackCacheKeyUsage: vi.fn(),
    };

    const translator = new CbrEroStatusMvTranslator();
    translator.getRuntime = () => runtime;

    expect(translator.enablePluginTranslation()).toBe(true);
    const counts = translator.getCachedCountsSync({ runtime });
    // Pure \V[126] template is excluded; only '経験人数' is counted
    expect(counts.total).toBe(1);
    expect(counts.left).toBe(0);

    const win = new Window_EroStatus();
    win.update();
    expect(measuredTexts).toEqual(['Virgin (Var)']);
    expect(drawnTexts).toEqual(['Virgin (Var)']);
    expect(window.CBR_eroStatus[0].t[1].subject).toBe('Partners');
});

it('RecollectionRoomTranslator and CallEnemyTranslator translate locked hints and enemy summon messages', async () => {
    const addedMessages = [];

    class Game_Action {
        showCallMessage(enemy, success) {
            if (success && enemy) {
                window.$gameMessage.add(`${enemy.name()}があらわれた！`);
            } else {
                window.$gameMessage.add('しかし だれもこなかった！');
            }
        }
    }

    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'RecollectionRoom',
                status: true,
                parameters: {
                    DefaultLockedMessage: 'まだ解放されていません',
                    Items: JSON.stringify([
                        JSON.stringify({
                            Page: '1',
                            Slot: '2',
                            HintText: '1章のボスに敗北する',
                        }),
                    ]),
                },
            },
            {
                name: 'CallEnemy',
                status: true,
                parameters: {
                    SuccessMessage: '%1があらわれた！',
                    FailureMessage: 'しかし だれもこなかった！',
                },
            },
        ],
        $gameMessage: {
            add: (text) => addedMessages.push(text),
        },
        Game_Action,
    });

    const cache = new Map([
        ['plugin_call_enemy:%1があらわれた！', '%1 appeared!'],
        ['plugin_call_enemy:しかし だれもこなかった！', 'But nobody came!'],
        ['enemy_name:ゴブリン', 'Goblin'],
    ]);

    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: cache,
        hasUsableCacheValue: (key) => cache.has(key) && !!cache.get(key),
        trackCacheKeyUsage: vi.fn(),
        getMessageCacheKey: (text) => `message:${text}`,
        setCacheValue: vi.fn(),
    };

    const recTranslator = new RecollectionRoomTranslator();
    recTranslator.getRuntime = () => runtime;
    recTranslator.collectParameterTexts(window.$plugins[0].parameters);
    expect([...recTranslator.entries.keys()]).toEqual([
        'まだ解放されていません',
        '1章のボスに敗北する',
    ]);

    const callTranslator = new CallEnemyTranslator();
    callTranslator.getRuntime = () => runtime;
    expect(callTranslator.enablePluginTranslation()).toBe(true);
    expect(callTranslator.getCachedCountsSync({ runtime })).toEqual({
        total: 2,
        left: 0,
        totalStrings: 2,
        leftStrings: 0,
    });

    const action = new Game_Action();
    action.showCallMessage({ name: () => 'ゴブリン' }, true);
    action.showCallMessage(null, false);

    expect(addedMessages).toEqual(['Goblin appeared!', 'But nobody came!']);
});
