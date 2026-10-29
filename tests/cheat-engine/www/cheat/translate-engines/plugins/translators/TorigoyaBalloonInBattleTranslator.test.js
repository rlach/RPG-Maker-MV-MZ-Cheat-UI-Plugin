import { afterEach, expect, it, vi } from 'vitest';
import { TorigoyaBalloonInBattleTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TorigoyaBalloonInBattleTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('scans nested talk configuration and manual commands without collecting conditions or IDs', () => {
    const translator = new TorigoyaBalloonInBattleTranslator();
    translator.collectParameterTexts({
        talkConfig: JSON.stringify([
            JSON.stringify({
                id: 'set',
                name: 'Internal',
                talkSkill: JSON.stringify([
                    JSON.stringify({
                        message: 'Hello\\n\\target',
                        optional: 'a.hp > 0',
                        sound: '{"name":"voice"}',
                    }),
                ]),
            }),
        ]),
    });
    translator.collectCommandTexts([
        {
            code: 357,
            parameters: [
                translator.getPluginName(),
                'talkEnemyByText',
                '',
                { text: 'Manual\\nmessage' },
            ],
        },
        {
            code: 357,
            parameters: [translator.getPluginName(), 'changeTalkSet', '', { text: 'Ignore me' }],
        },
    ]);
    expect([...translator.entries.keys()]).toEqual(['Hello\n\\target', 'Manual\nmessage']);
});

it('translates before dynamic substitution, preserves configuration and tracks original keys only', () => {
    vi.stubGlobal('window', globalThis);
    const builder = { build: (item, options) => item.message.replace(/\\target/g, options.target) };
    class Battler {
        torigoyaBalloonInBattle_setMessageParameter(type, message) {
            this.message = message;
        }
    }
    vi.stubGlobal('Torigoya', { BalloonInBattle: { TalkBuilder: builder } });
    vi.stubGlobal('Game_Battler', Battler);
    const translator = new TorigoyaBalloonInBattleTranslator();
    const seen = [];
    const runtime = {
        enabled: true,
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: (key) => seen.push(key),
        translationCache: new Map([
            ['原文\\target', 'Hello \\target'],
            ['手動\n本文', 'Manual\ntext'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
    };
    translator.getRuntime = () => runtime;
    translator.registerPluginCustomTags = vi.fn();
    expect(translator.enablePluginTranslation()).toBe(true);
    const item = { message: '原文\\target', condition: 'original' };
    const battler = new Battler();
    battler.torigoyaBalloonInBattle_setMessageParameter(
        'skill',
        builder.build(item, { target: 'Alice' }),
        { talkItem: item }
    );
    expect(battler.message).toBe('Hello Alice');
    expect(item.message).toBe('原文\\target');
    expect(seen).toEqual(['原文\\target']);
    battler.torigoyaBalloonInBattle_setMessageParameter('manual', '手動\n本文');
    expect(battler.message).toBe('Manual\ntext');
    runtime.enabled = false;
    runtime.isTranslationEnabled = () => false;
    expect(builder.build(item, { target: 'Alice' })).toBe('原文Alice');
});
