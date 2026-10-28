import { afterEach, expect, it, vi } from 'vitest';
import { RJ01716681UITranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/RJ01716681UITranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('scans custom save/menu templates and skill notes, preserving dynamic data at display time', async () => {
    const sources = {
        CustomSaveLayout_new: `function display(info) {
            const dateText = getDate(info.timestamp);
            win.drawText("保存日時: " + dateText, 0, 0);
            const partText = "天音パート";
            win.drawText("パート: " + partText, 0, 0);
            const daysText = info.gameDays + "日目";
            win.drawText("進行状況: " + daysText, 0, 0);
            win.drawText("場所: " + info.mapname, 0, 0);
        }`,
        MenuSubCommand:
            'win.drawText(`経過日数：${$gameVariables.value(1)}日目`,0,0); win.drawText(`現在地：${$gameMap.displayName()}`,0,30);',
        MyDisplayFunctions: 'function display(win) {win.drawText("相手の行動が読めない……",0,0);}',
    };
    const plugins = Object.keys(sources).map((name) => ({ name, status: true, parameters: {} }));
    vi.stubGlobal('window', { $plugins: plugins });
    const note =
        'HPを1,000回復させることができる霊術。\n相手が攻撃をしてきた時に使った場合は失敗に終わる';
    const skills = [null, { id: 5, name: '祝詞', description: '', note }];
    const before = structuredClone(skills);
    vi.stubGlobal('fetch', async (path) => ({
        ok: true,
        text: async () => sources[path.split('/').pop().replace('.js', '')],
        json: async () => skills,
    }));
    const translator = new RJ01716681UITranslator();
    expect(translator.detectPlugin()).toBe(true);
    await translator.precomputeCounts();
    expect(translator.entries.has(note)).toBe(true);
    expect(translator.entries.has('天音パート')).toBe(true);
    const values = new Map([
        ['保存日時: \\COT[0]', 'Saved: \\COT[0]'],
        ['経過日数：\\COT[0]日目', 'Elapsed: Day \\COT[0]'],
        ['進行状況: \\COT[0]', 'Progress: \\COT[0]'],
        ['\\COT[0]日目', 'Day \\COT[0]'],
        ['パート: \\COT[0]', 'Part: \\COT[0]'],
        ['天音パート', 'Amane part'],
        ['場所: \\COT[0]', 'Location: \\COT[0]'],
        [note, 'Restores 1,000 HP.\nFails if the opponent attacks.'],
    ]);
    const runtime = {
        getCacheKey: (value) => value,
        translationCache: values,
        hasUsableCacheValue: (key) => values.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    translator.isRuntimeTranslationActive = () => true;
    translator.prepareDynamicValueTag = () => {};
    expect(translator.resolveText('保存日時: 2026/10/28 13:18', runtime)).toBe(
        'Saved: 2026/10/28 13:18'
    );
    expect(translator.resolveText('経過日数：18日目', runtime)).toBe('Elapsed: Day 18');
    expect(translator.resolveText('進行状況: 2日目', runtime)).toBe('Progress: Day 2');
    expect(translator.resolveText('パート: 天音パート', runtime)).toBe('Part: Amane part');
    expect(translator.resolveText('場所: Academy 1F', runtime)).toBe('Location: Academy 1F');
    expect(translator.resolveText(note, runtime)).toBe(
        'Restores 1,000 HP.\nFails if the opponent attacks.'
    );
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(note, expect.anything());
    expect(skills).toEqual(before);
    plugins.splice(0, 1);
    expect(translator.detectPlugin()).toBe(false);
});
