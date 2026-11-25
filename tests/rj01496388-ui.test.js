import { it, expect, vi, afterEach } from 'vitest';
import { AddPluginUiSuiteTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/AddPluginUiSuiteTranslator.js';
import { DarkPlasmaIndividualItemCommandTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/DarkPlasmaIndividualItemCommandTranslator.js';
import { UniqueDataLoaderTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/UniqueDataLoaderTranslator.js';
import { MNKRTMLogWindowMZTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MNKRTMLogWindowMZTranslator.js';
vi.mock(
    '../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function runtime() {
    return {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        maxLineWidth: 120,
        sourceLang: 'ja',
        targetLang: 'en',
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
        wrapText: (text) => text,
        cleanTranslatedText: (text) => text,
    };
}
it.each([
    [
        AddPluginUiSuiteTranslator,
        'AddPlugin_StatusActorMenu',
        'const params=["攻撃力","防御力","魔法力","魔法防御"]; this.drawText("現在のEXP");this.drawText("次のレベルまで");this.drawText("武器2");this.drawText("HP再生率");',
        '現在のEXP',
    ],
    [
        DarkPlasmaIndividualItemCommandTranslator,
        'DarkPlasma_IndividualItemCommand',
        'const command={name:"つかう",symbol:"use"}; this.addCommand("捨てる","discard");',
        'つかう',
    ],
])(
    'scans dedicated enabled UI sources and preserves source identity (%s)',
    async (Class, name, source, label) => {
        vi.stubGlobal('window', globalThis);
        vi.stubGlobal('$plugins', [{ name: 'folder/' + name, status: true, parameters: {} }]);
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: true, text: async () => source }))
        );
        const translator = new Class();
        expect(translator.detectPlugin()).toBe(true);
        await translator.precomputeCounts();
        expect(translator.entries.has(label)).toBe(true);
        expect(translator.entries.has('use')).toBe(false);
        const rt = runtime();
        rt.translationCache.set(
            rt.getCacheKey(label, translator.getCacheType()),
            'Translated label'
        );
        expect(translator.resolveText(label, rt)).toBe('Translated label');
        expect(translator.resolveText('Translated label', rt)).toBe('Translated label');
        expect(translator.entries.has('Translated label')).toBe(false);
        rt.enabled = false;
        expect(translator.resolveText(label, rt)).toBe(label);
        vi.stubGlobal('$plugins', [{ name: 'folder/' + name, status: false }]);
        expect(new Class().detectPlugin()).toBe(false);
    }
);
it('resolves matching-level and price help before numeric expansion and snapshots translated log output without mutating originals', () => {
    vi.stubGlobal('window', globalThis);
    const values = { 1008: 12, 20: 2400, 1010: 45 };
    const matching = 'レベルと同じ階層から始めます。\r\n現在の最高到達階層：\\V[1008]';
    const resting =
        '\\C[17]\\V[1010]G\\C[0]払って休みます。\r\n※現在の所持金　\\C[17]\\V[20]G\\C[0]';
    const dialogue = '「\\N[11]にい～っぱい貢いでね♡」';
    values[131] = matching;
    values[86] = dialogue;
    vi.stubGlobal('$gameVariables', { value: (id) => values[id] ?? 0 });
    class Base {
        convertEscapeCharacters(text) {
            let result = text.replace(/\\/g, '\x1b');
            for (let i = 0; i < 2; i++)
                result = result.replace(/\x1bV\[(\d+)\]/gi, (_, id) =>
                    String(values[id] ?? 0).replace(/\\/g, '\x1b')
                );
            return result.replace(/\x1bN\[11\]/gi, 'Meme');
        }
        drawTextEx(text) {
            return text;
        }
    }
    class Message {
        add() {}
        faceName() {
            return '';
        }
    }
    class System {
        constructor() {
            this._actionLog = [];
        }
        addLog(text) {
            this._actionLog.push(dummy.convertEscapeCharacters(text));
        }
    }
    class Window_MapLog extends Base {}
    const dummy = new Base();
    vi.stubGlobal('$gameTemp', { dummyWindow: () => dummy });
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Game_System', System);
    const rt = runtime();
    const unique = new UniqueDataLoaderTranslator();
    unique.collectRows([{ helpText: matching }, { helpText: resting }, { text: dialogue }]);
    vi.spyOn(unique, 'getRuntime').mockReturnValue(rt);
    vi.spyOn(unique, 'precomputeCounts').mockResolvedValue();
    rt.translationCache.set(
        rt.getCacheKey(matching.replace(/\r\n/g, '\n'), 'message'),
        'Start at matching level.\nHighest floor: \\V[1008]'
    );
    rt.translationCache.set(
        rt.getCacheKey(resting.replace(/\r\n/g, '\n'), 'message'),
        'Pay \\C[17]\\V[1010]G\\C[0] to rest.\nMoney: \\V[20]G'
    );
    rt.translationCache.set(rt.getCacheKey(dialogue, 'message'), 'Give \\N[11] plenty of gifts!');
    unique.enablePluginTranslation();
    expect(dummy.convertEscapeCharacters(String.raw`\V[131]`)).toBe(
        'Start at matching level.\nHighest floor: 12'
    );
    values[131] = resting;
    expect(dummy.convertEscapeCharacters(String.raw`\V[131]`)).toContain('Money: 2400G');
    const log = new MNKRTMLogWindowMZTranslator();
    vi.spyOn(log, 'getRuntime').mockReturnValue(rt);
    log.enablePluginTranslation();
    const command = {
        code: 357,
        parameters: [
            '06_expansion_plugin/MNKR_TMLogWindowMZ',
            'addLog',
            '',
            { text: String.raw`\V[20]Gを拾った！` },
        ],
    };
    expect(log.extractEntryFromCommand(command)).toBe(String.raw`\V[20]Gを拾った！`);
    rt.translationCache.set(
        rt.getCacheKey(command.parameters[3].text, log.getCacheType()),
        String.raw`Picked up \V[20]G!`
    );
    const system = new System();
    system.addLog(command.parameters[3].text);
    system.addLog(String.raw`\V[86]`);
    expect(system._actionLog).toEqual(['2400Gを拾った！', '「Memeにい～っぱい貢いでね♡」']);
    values[20] = 99;
    const view = new Window_MapLog();
    expect(view.drawTextEx(system._actionLog[0])).toBe('Picked up 2400G!');
    expect(view.drawTextEx(system._actionLog[1])).toBe('Give Meme plenty of gifts!');
    expect(values[86]).toBe(dialogue);
    rt.enabled = false;
    expect(view.drawTextEx(system._actionLog[0])).toBe('2400Gを拾った！');
});
it('measures and draws translated item commands while retaining their original labels and symbols', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'DarkPlasma_IndividualItemCommand', status: true, parameters: {} },
    ]);
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => 'const command = {name:"つかう",symbol:"use"};',
    }));
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class Base {
        constructor() {
            this.contents = new Bitmap();
        }
        drawText(text) {
            return this.contents.drawText(text);
        }
        drawTextEx(text) {
            return this.contents.drawText(text);
        }
        textSizeEx(text) {
            return { width: this.drawTextEx(text).length * 10 };
        }
    }
    class Message {
        add() {}
    }
    class MessageWindow {
        startMessage() {}
    }
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    const translator = new DarkPlasmaIndividualItemCommandTranslator();
    const rt = runtime();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(rt);
    await translator.precomputeCounts();
    rt.translationCache.set(rt.getCacheKey('つかう', translator.getCacheType()), 'Use this item');
    expect(translator.enablePluginTranslation()).toBe(true);
    const command = { name: 'つかう', symbol: 'use' };
    const view = new Base();
    for (let i = 0; i < 2; i++) {
        expect(view.textSizeEx(command.name).width).toBe(130);
        expect(view.drawText(command.name)).toBe('Use this item');
    }
    expect(command).toEqual({ name: 'つかう', symbol: 'use' });
    expect(translator.entries.has('Use this item')).toBe(false);
    rt.enabled = false;
    expect(view.drawText(command.name)).toBe('つかう');
});

it('keeps font-prefixed log permutations on one source template and never harvests rendered dialogue', () => {
    vi.stubGlobal('window', globalThis);
    const values = { 522: 'GhostB Lv:2', 547: 'Magic Slash', 574: 'Inu', 512: 20 };
    class Base {
        convertEscapeCharacters(text) {
            return text
                .replace(/\\/g, '\x1b')
                .replace(/\x1bV\[(\d+)\]/gi, (_, id) => String(values[id]));
        }
        drawTextEx(text) {
            return text;
        }
    }
    class Message {
        add() {}
        faceName() {
            return '';
        }
    }
    const dummy = new Base();
    class System {
        constructor() {
            this._actionLog = [];
        }
        addLog(text) {
            this._actionLog.push(dummy.convertEscapeCharacters(text));
        }
    }
    class Window_MapLog extends Base {}
    class Window_MenuLog extends Base {}
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Game_System', System);
    vi.stubGlobal('$gameTemp', { dummyWindow: () => dummy });
    const rt = runtime();
    rt.getPreferredMessageCacheEntry = () => null;
    const translator = new MNKRTMLogWindowMZTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(rt);
    const source = String.raw`\C[18]\V[522]\C[0]の\V[547]！\C[1]\V[574]\C[0]に\C[17]\V[512]\C[0]のダメージ！`;
    const translated = String.raw`\C[18]\V[522]\C[0] uses \V[547]! \C[1]\V[574]\C[0] takes \C[17]\V[512]\C[0] damage!`;
    translator._scanEntries = [{ text: source }];
    const key = rt.getCacheKey(source, translator.getCacheType());
    rt.translationCache.set(key, translated);
    translator.enablePluginTranslation();
    const system = new System();
    const map = new Window_MapLog();
    const menu = new Window_MenuLog();
    for (let damage = 1; damage <= 100; damage++) {
        values[512] = damage;
        values[547] = 'Skill ' + damage;
        system.addLog(source);
        const stored = system._actionLog.at(-1);
        // This prefix is added by both native log windows after addLog.
        const text = String.raw`\FS[24]` + stored;
        const expected = String.raw`\FS[24]` + dummy.convertEscapeCharacters(translated);
        values[512] = 9999;
        expect(map.drawTextEx(text)).toBe(expected);
        expect(menu.drawTextEx(text)).toBe(expected);
        expect(map.drawTextEx(text)).toBe(expected);
        expect(stored).toContain('のダメージ！');
    }
    const dialogue = String.raw`\C[14]"Hmm? Are you okay~?♡ Your HP is dropping♡"\C[0]`;
    system.addLog(dialogue);
    expect(map.drawTextEx(String.raw`\FS[24]` + system._actionLog.at(-1))).toContain(
        'Are you okay'
    );
    // Reloaded saves have no in-memory provenance, including old malformed keys.
    const historical = String.raw`\FS[24]\C[18]GhostA Lv:99\C[0]のSkill 999！`;
    expect(menu.drawTextEx(historical)).toBe(historical);
    expect(new Set(rt.trackCacheKeyUsage.mock.calls.map(([key]) => key))).toEqual(new Set([key]));
    expect(rt.translationCache.size).toBe(1);
    rt.enabled = false;
    const original = String.raw`\FS[24]` + system._actionLog[0];
    expect(map.drawTextEx(original)).toBe(original);
});
