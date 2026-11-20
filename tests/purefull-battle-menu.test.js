import { afterEach, expect, it, vi } from 'vitest';
import { PurefullBattleMenuTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/PurefullBattleMenuTranslator.js';
import { TorigoyaNotifyMessageTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/TorigoyaNotifyMessageTranslator.js';
afterEach(() => vi.unstubAllGlobals());
it('harvests custom notify Show commands without admitting unrelated commands', () => {
    const t = new TorigoyaNotifyMessageTranslator();
    const command = {
        code: 357,
        parameters: [
            'TorigoyaMZ_NotifyMessage_CommandMessage',
            'Show',
            '',
            { message: '\\C[27]シドウはあまねを標的にしている…' },
        ],
    };
    expect(t.extractMZNotifyEntry(command).text).toBe(command.parameters[3].message);
    command.parameters[1] = 'Other';
    expect(t.extractMZNotifyEntry(command)).toBeNull();
});
it('collects battle log payloads, reward headings and prediction overrides without altering notes', async () => {
    const skill = {
        note: '<行動予測:  text:拘束> <SpecialVariableEvasion:50>',
        name: 'ザコッツ拘束',
    };
    vi.stubGlobal('window', { $dataSkills: [null, skill] });
    const t = new PurefullBattleMenuTranslator();
    t.registerPluginCustomTags = () => {};
    t.collectParameterTexts({ DropItemHeadline: '\\c[16]【戦利品】\\c[0]' });
    t.collectCommandTexts([
        {
            code: 357,
            parameters: [
                'BattleLogOutput',
                'OUTPUT_LOG',
                '',
                { message: '\\N[2]の拘束が深まる…！' },
            ],
        },
    ]);
    await t.collectAdditionalTexts();
    expect([...t.entries.keys()]).toEqual(
        expect.arrayContaining(['拘束', '\\N[2]の拘束が深まる…！', '\\c[16]【戦利品】\\c[0]'])
    );
    expect(skill.note).toBe('<行動予測:  text:拘束> <SpecialVariableEvasion:50>');
});
it('translates text rendering and logs before expansion, preserving numeric values and native log source', () => {
    class Base {
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
    class Message extends Base {
        startMessage() {}
    }
    class GameMessage {
        add(text) {
            return text;
        }
    }
    const manager = {
        displayCustomLog(text) {
            return text;
        },
    };
    vi.stubGlobal('window', {
        Window_Base: Base,
        Bitmap,
        Window_Message: Message,
        Game_Message: GameMessage,
        BattleManager: manager,
    });
    const t = new PurefullBattleMenuTranslator();
    t.registerPluginCustomTags = () => {};
    t.precomputeCounts = async () => {};
    const cache = new Map([
        ['会心率', 'Critical Rate'],
        ['拘束', 'Bind'],
        ['\\N[2]の拘束が深まる…！', '\\N[2] is bound more tightly!'],
    ]);
    let enabled = true;
    const runtime = {
        isTranslationEnabled: () => enabled,
        engine: {},
        getCacheKey: (s) => s,
        translationCache: cache,
        hasUsableCacheValue: (k) => cache.has(k),
        trackCacheKeyUsage: vi.fn(),
    };
    t.getRuntime = () => runtime;
    for (const text of cache.keys()) t.entries.set(text, { text });
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Base().drawText('会心率')).toBe('Critical Rate');
    expect(new Bitmap().drawText('拘束')).toBe('Bind');
    const source = '\\N[2]の拘束が深まる…！';
    expect(manager.displayCustomLog(source)).toBe('\\N[2] is bound more tightly!');
    expect(source).toBe('\\N[2]の拘束が深まる…！');
    expect(new Base().drawText('0')).toBe('0');
    enabled = false;
    expect(manager.displayCustomLog(source)).toBe(source);
});
