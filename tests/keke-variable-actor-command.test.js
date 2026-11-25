import { afterEach, expect, it, vi } from 'vitest';
import { KekeVariableActorCommandTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/KekeVariableActorCommandTranslator.js';
import { BattleEroTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/BattleEroTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function createKekeSetup() {
    const actorNote = [
        '<コマンド:スキル/160,5,チートパンチ,77>',
        '<コマンド:スキル/物理攻撃,10,物理攻撃,162>',
        '<コマンド:スキル/精神攻撃,20,精神攻撃,163>',
        '<コマンド:スキル/催眠攻撃,30,催眠攻撃,165>',
        '<コマンド:スキル/幻覚攻撃,40,幻覚攻撃,161>',
        '<コマンド:スキル/拘束攻撃,50,拘束攻撃,164>',
        '<コマンド:-スキル/魔法>',
    ].join('\n');

    class Window_ActorCommand {
        constructor() {
            this._list = [];
            this._actor = { _actorId: 1 };
        }

        makeCommandList() {
            this._list = [];
            const actor = window.$dataActors[1];
            const stypeIdx = window.$dataSystem.skillTypes.indexOf('物理攻撃');
            if (!actor.note.includes('<コマンド:スキル/160') || stypeIdx !== 1) {
                return;
            }
            this._list.push(
                {
                    name: 'チートパンチ',
                    symbol: 'skillOne',
                    enabled: true,
                    ext: 160,
                    helpText: '一撃で敵を倒す。',
                },
                {
                    name: '物理攻撃',
                    symbol: 'skill',
                    enabled: true,
                    ext: 1,
                    helpText: '物理で攻撃する。',
                },
                {
                    name: '精神攻撃',
                    symbol: 'skill',
                    enabled: true,
                    ext: 2,
                    helpText: '',
                },
                {
                    name: 'オート',
                    symbol: 'auto',
                    enabled: true,
                    ext: null,
                    helpText: '',
                }
            );
        }
    }

    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'Keke_VariableActorCommand',
                status: true,
                parameters: {
                    '用語・自動戦闘': 'オート',
                    ヘルプ登録: JSON.stringify([
                        JSON.stringify({
                            ヘルプ名: '物理攻撃',
                            テキスト: '物理で攻撃する。',
                            アイコン: '',
                        }),
                    ]),
                },
            },
        ],
        $dataSystem: {
            skillTypes: ['', 'Physical Attack', 'Mental Attack'],
            skillTypesOriginal: ['', '物理攻撃', '精神攻撃'],
        },
        $dataActors: [
            null,
            {
                id: 1,
                name: 'キモ男',
                note: '<command:translated>',
                _translateOriginal: {
                    note: actorNote,
                },
            },
        ],
        $dataClasses: [null],
        $dataSkills: [null],
        $dataItems: [null],
        $dataWeapons: [null],
        $dataArmors: [null],
        $dataStates: [null],
        $dataEnemies: [null],
        Window_ActorCommand,
    });

    const cache = new Map();
    const seen = [];
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type}:${String(text).replace(/\n+$/, '')}`,
        translationCache: cache,
        hasUsableCacheValue: (key) => {
            const val = cache.get(key);
            return typeof val === 'string' && val.trim() !== '';
        },
        trackCacheKeyUsage: vi.fn((key, options) => {
            if (options?.harvestMissing !== false) {
                seen.push(key);
            }
        }),
    };

    const translator = new KekeVariableActorCommandTranslator();
    translator.getRuntime = () => runtime;

    return { translator, runtime, cache, seen, Window_ActorCommand };
}

it('scans Keke_VariableActorCommand note commands and parameters and resolves translations from skill_name and skillType caches', async () => {
    const { translator, runtime, cache, seen, Window_ActorCommand } = createKekeSetup();

    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();

    const initialCounts = translator.getCachedCountsSync({ runtime });
    expect(initialCounts.total).toBe(8);
    expect(initialCounts.left).toBe(8);

    // Even if command cache has empty placeholders "", skill_name and skillType translations must be used
    cache.set('command:チートパンチ', '');
    cache.set('command:物理攻撃', '');
    cache.set('skill_name:チートパンチ', 'Cheat Punch');
    cache.set('skillType:物理攻撃', 'Physical Attack');
    cache.set('skillType:精神攻撃', 'Mental Attack');
    cache.set('skillType:催眠攻撃', 'Hypnosis Attack');
    cache.set('skillType:幻覚攻撃', 'Hallucination Attack');
    cache.set('skillType:拘束攻撃', 'Restraint Attack');
    cache.set('plugin_keke_variable_actor_command:オート', 'Auto');
    cache.set('plugin_keke_variable_actor_command:物理で攻撃する。', 'Attack with physical moves.');
    cache.set('skill_description:一撃で敵を倒す。', 'Defeat an enemy in one hit.');

    expect(translator.collectUntranslated({ runtime })).toEqual([]);
    expect(translator.getCachedCountsSync({ runtime }).left).toBe(0);

    const cmdWindow = new Window_ActorCommand();
    cmdWindow.makeCommandList();

    expect(cmdWindow._list.map((entry) => entry.name)).toEqual([
        'Cheat Punch',
        'Physical Attack',
        'Mental Attack',
        'Auto',
    ]);
    expect(cmdWindow._list[0].helpText).toBe('Defeat an enemy in one hit.');
    expect(cmdWindow._list[1].helpText).toBe('Attack with physical moves.');

    // Repeated makeCommandList calls must not harvest translated labels as new source keys
    seen.length = 0;
    cmdWindow.makeCommandList();
    expect(seen).toEqual([]);
    expect(cmdWindow._list.map((entry) => entry.name)).toEqual([
        'Cheat Punch',
        'Physical Attack',
        'Mental Attack',
        'Auto',
    ]);

    // Disabling runtime translation restores original Japanese labels
    runtime.enabled = false;
    cmdWindow.makeCommandList();
    expect(cmdWindow._list.map((entry) => entry.name)).toEqual([
        'チートパンチ',
        '物理攻撃',
        '精神攻撃',
        'オート',
    ]);
    expect(cmdWindow._list[0].helpText).toBe('一撃で敵を倒す。');
});

it('catalogs and translates BattleEro dynamic battle log templates and option label', async () => {
    class Window_Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
    }
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class Game_Message {
        faceName() {
            return '';
        }
        add(text) {
            return text;
        }
    }
    class Window_Message extends Window_Base {
        startMessage() {}
    }

    const battleEroSource = `
        (() => {
            const log = t => BattleManager._logWindow.push("addText", t);
            log(\`\${e.name()}の服が破れ、下着姿になった！\`);
            log(\`\${e.name()}は全裸にされてしまった！\`);
            this.addCommand("戦闘カットイン", "eroCutin");
            b.drawText("快感", 12, 4, 56, 24, "right");
        })();
    `;

    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => battleEroSource,
        }))
    );

    vi.stubGlobal('window', {
        $plugins: [{ name: 'BattleEro', status: true, parameters: {} }],
        Window_Base,
        Bitmap,
        Game_Message,
        Window_Message,
    });

    const cache = new Map([
        [
            'plugin_battle_ero:\\COT[0]の服が破れ、下着姿になった！',
            "\\COT[0]'s clothes tore, leaving her in her underwear!",
        ],
        ['enemy_name:ひなの', 'Hinano'],
        ['plugin_battle_ero:快感', 'Pleasure'],
    ]);

    const runtime = {
        enabled: true,
        engine: { addPluginTags: vi.fn() },
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: cache,
        hasUsableCacheValue: (key) => cache.has(key) && !!cache.get(key),
        trackCacheKeyUsage: vi.fn(),
    };

    const translator = new BattleEroTranslator();
    translator.getRuntime = () => runtime;

    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();

    const win = new Window_Base();
    expect(win.drawTextEx('ひなのの服が破れ、下着姿になった！')).toBe(
        "Hinano's clothes tore, leaving her in her underwear!"
    );

    const bmp = new Bitmap();
    expect(bmp.drawText('快感')).toBe('Pleasure');
});
