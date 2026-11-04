import { afterEach, expect, it, vi } from 'vitest';
import { GraceDungeonUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/GraceDungeonUiTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('scans modified core windows, skill tables and event-script pickup messages', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [{ name: 'Game_Dungeon', status: true, parameters: {} },
        { name: 'SkillTree', status: true, parameters: {} }]);
    vi.stubGlobal('$dataMapInfos', []);
    vi.stubGlobal('$dataCommonEvents', [{ list: [{ code: 355, parameters: [
        'text = $gameVariables.value(2) + "を拾った！"; BattleManager._logWindow.push("addText", text);',
    ] }] }]);
    const sources = {
        'js/plugins/Game_Dungeon.js': 'text = actor.name() + "を装備した！";',
        'js/plugins/SkillTree.js': 'TREE_TYPE[0] = "ソードマン"; TREE_TYPE_INFO[0] = "近接戦闘で有用なスキルを主体とするツリー";',
        'js/rpg_windows.js': 'this.drawText("◆ステータス情報◆", 0, 0); this.drawText("[所持SP]", 0, 0); this.drawText(floor + "階", 0, 0); this.drawText("[固有]", 0, 0);',
        'js/rpg_objects.js': 'text += "[装備攻撃力変化  " + beforeParam + " -> " + afterParam + "]";',
        'js/rpg_scenes.js': 'this.addCommand("おく", "place");',
        'js/rpg_managers.js': '',
    };
    vi.stubGlobal('fetch', vi.fn(async (path) => {
        if (!(path in sources)) throw new Error(`Unexpected source: ${path}`);
        return { ok: true, text: async () => sources[path] };
    }));
    const translator = new GraceDungeonUiTranslator();
    await translator.precomputeCounts();
    for (const text of ['◆ステータス情報◆', '[所持SP]', '[固有]', 'ソードマン', 'おく',
        '\\COT[0]を拾った！', '[装備攻撃力変化  \\COT[0] -> \\COT[1]]'])
        expect(translator.entries.has(text), text).toBe(true);

    const runtime = {
        isTranslationEnabled: () => true,
        engine: {},
        getCacheKey: (text) => text,
        hasUsableCacheValue(key) { return this.translationCache.has(key); },
        translationCache: new Map([
            ['\\COT[0]を拾った！', 'Picked up \\COT[0]!'],
            ['[装備攻撃力変化  \\COT[0] -> \\COT[1]]', '[Equipment ATK: \\COT[0] -> \\COT[1]]'],
            ['◆ステータス情報◆', '◆Status◆'],
        ]),
        trackCacheKeyUsage: vi.fn(),
    };
    translator.tagEngine = runtime.engine;
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    class Window { drawTextEx(text) { return text; } }
    translator.hookDrawing(Window.prototype, 'drawTextEx');
    const logSource = 'Silver Sword+1を拾った！';
    expect(new Window().drawTextEx(logSource)).toBe('Picked up Silver Sword+1!');
    expect(new Window().drawTextEx('[装備攻撃力変化  0 -> 12]')).toBe('[Equipment ATK: 0 -> 12]');
    expect(new Window().drawTextEx('◆ステータス情報◆')).toBe('◆Status◆');
    expect(logSource).toBe('Silver Sword+1を拾った！');
    runtime.isTranslationEnabled = () => false;
    expect(new Window().drawTextEx(logSource)).toBe(logSource);
});
