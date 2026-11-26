import { afterEach, expect, it, vi } from 'vitest';
import { MyGameSuiteTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MyGameSuiteTranslator.js';
import { WindowsetMenuTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/WindowsetMenuTranslator.js';
import { SourceTextCatalogTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
import { collectMyDisplayParameters } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MyGameTextCatalog.js';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function runtime(t) {
    const rt = { enabled: true, isTranslationEnabled() { return this.enabled; }, engine: {},
        translationCache: new Map(), getCacheKey: (text, type) => type + ':' + text,
        hasUsableCacheValue(key) { return this.translationCache.has(key); }, trackCacheKeyUsage: vi.fn() };
    vi.spyOn(t, 'getRuntime').mockReturnValue(rt);
    vi.spyOn(t, 'registerPluginCustomTags').mockImplementation(() => {});
    return rt;
}
async function scan() {
    const plugins = [
        { name: 'My_Core', status: true, parameters: {} },
        { name: 'My_ForestLife', status: true, parameters: { rules: JSON.stringify({ nodes: [{ id: 4, name: '石材', image: '石の画像' }] }) } },
        { name: 'WindowsetMenu', status: true, parameters: { ws_scenes: JSON.stringify([{ id: 'scene', title: '設定画面', commands: [{ label: '戻る', symbol: 'cancel' }] }]) } },
    ];
    vi.stubGlobal('window', { $plugins: plugins.map(p => ({ ...p, parameters: { name: 'Already translated output' } })) });
    const data = {
        'js/plugins.js': 'var $plugins=' + JSON.stringify(plugins) + ';',
        'js/plugins/My_Core.js': 'const labels={title:"バランス！"};',
        'js/plugins/My_ForestLife.js': `function say(it,text){};say(this,n.name+'を'+result.qty+'個手に入れた。');const forestGuides={help:'温泉を育てよう'};const pages=[{label:'ゲームの目標',speech:'みんなで集まろう'}];`,
        'js/plugins/WindowsetMenu.js': 'const labels={title:"メニュー"};',
        'data/MapInfos.json': JSON.stringify([null, { id: 1 }]),
        'data/CommonEvents.json': '[]',
        'data/Map001.json': JSON.stringify({ events: [null, { note: '<ForestLabel:飛朗斗：開発・ショップ>', pages: [{ list: [{ code: 357, parameters: ['My_QTE', 'Start', '', { title: 'タイミング', picture: '秘密の画像', resultVariableId: 5 }] }] }] }] }),
    };
    vi.stubGlobal('fetch', vi.fn(async url => { if (!(url in data)) throw new Error('Unexpected source ' + url); return { ok: true, text: async () => data[url] }; }));
    const t = new MyGameSuiteTranslator(); await t.precomputeCounts(); return t;
}
it('scans original suite sources, parameter data and owned map labels without runtime feedback or assets', async () => {
    const t = await scan();
    expect([...t.entries.keys()]).toEqual(expect.arrayContaining(['バランス！','ゲームの目標','石材','飛朗斗','開発・ショップ','タイミング']));
    for (const source of ['石の画像','秘密の画像','Already translated output','cancel']) expect(t.entries.has(source)).toBe(false);
    expect(t.getPendingSourceEntries()).toContainEqual({ value: '飛朗斗', type: 'speaker' });
    expect(t.entries.get('みんなで集まろう').cacheType).toBe('message');
    expect(t.entries.get('温泉を育てよう').cacheType).toBe('message');
    const w = new WindowsetMenuTranslator(); await w.precomputeCounts();
    expect(w.entries.has('設定画面')).toBe(true); expect(w.entries.has('cancel')).toBe(false);
    expect(w.entries.has('Already translated output')).toBe(false);
});
it('uses a protected standard message template for variable harvest rewards and retains original-only cache keys', async () => {
    const t = await scan(); const rt = runtime(t);
    const source = '\\COT[0]を\\COT[1]個手に入れた。';
    expect(t.entries.get(source).cacheType).toBe('message');
    rt.translationCache.set('message:' + source, 'Obtained \\COT[1] \\COT[0].');
    rt.translationCache.set('plugin_my_game_suite:石材', 'Stone');
    const pending = t.collectUntranslated({ runtime: rt });
    expect(pending.some(item => item.value === source)).toBe(false);
    for (let i = 0; i < 3; i++) expect(t.resolveText('石材を5個手に入れた。', rt)).toBe('Obtained 5 Stone.');
    const before = rt.trackCacheKeyUsage.mock.calls.length;
    expect(t.resolveText('Obtained 5 Stone.', rt)).toBe('Obtained 5 Stone.');
    expect(rt.trackCacheKeyUsage.mock.calls).toHaveLength(before);
    await t.precomputeCounts(); expect(t.entries.has('Obtained 5 Stone.')).toBe(false);
    rt.enabled = false; expect(t.resolveText('石材を5個手に入れた。', rt)).toBe('石材を5個手に入れた。');
});
it('translates complete private guide paragraphs before native wrapping and supports direct canvas measurement/drawing', async () => {
    class Canvas {
        fillText(text) { this.drawn = text; }
        measureText(text) { return { width: text.length }; }
    }
    class Scene { addWindow(target) { this.target = target; } }
    class ForestGuidePanel { wrap(text) { return text.split(' '); } }
    vi.stubGlobal('window', { CanvasRenderingContext2D: Canvas, Scene_Base: Scene });
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(true);
    const t = new MyGameSuiteTranslator(); const rt = runtime(t); t.scanPromise = Promise.resolve();
    t.entries.set('温泉を育てよう', { text: '温泉を育てよう', cacheType: 'message' });
    rt.translationCache.set('message:温泉を育てよう', 'Grow the hot springs');
    expect(t.enablePluginTranslation()).toBe(true);
    const guide = new ForestGuidePanel(); new Scene().addWindow(guide);
    expect(guide.wrap('温泉を育てよう')).toEqual(['Grow','the','hot','springs']);
    const instruction = '名前の横に◆があると開発可能';
    const exploration = '探索で素材を集め、仲間に渡そう。';
    for (const [text, translation] of [[instruction, 'A diamond marks available development'], [exploration, 'Gather materials and give them to companions.']]) {
        t.entries.set(text, { text });
        rt.translationCache.set(`plugin_my_game_suite:${text}`, translation);
    }
    const assembled = instruction + '\n\n' + exploration + '\nCurrent Lv.1';
    expect(guide.wrap(assembled).join(' ')).toBe('A diamond marks available development\n\nGather materials and give them to companions.\nCurrent Lv.1');
    const guideSeen = rt.trackCacheKeyUsage.mock.calls.length;
    t.resolveGuideText('A diamond marks available development\nCurrent Lv.1');
    expect(rt.trackCacheKeyUsage.mock.calls).toHaveLength(guideSeen);
    const template = '状態：\\COT[0]\n\\COT[1]';
    t.entries.set(template, { text: template });
    t.templates.push({ text: template, pattern: /^状態：([^\n]*)\n([\s\S]*)$/ });
    rt.translationCache.set(`plugin_my_game_suite:${template}`, 'Status: \\COT[0]\n\\COT[1]');
    expect(t.resolveGuideText('状態：OK\n' + instruction)).toBe('Status: OK\nA diamond marks available development');
    const context = new Canvas(); context.fillText('温泉を育てよう');
    expect(context.drawn).toBe('Grow the hot springs');
    expect(context.measureText('温泉を育てよう').width).toBe(20);
    const before = rt.trackCacheKeyUsage.mock.calls.length;
    context.fillText(context.drawn); expect(rt.trackCacheKeyUsage.mock.calls).toHaveLength(before);
    rt.enabled = false; expect(guide.wrap('温泉を育てよう')).toEqual(['温泉を育てよう']);
    context.fillText('温泉を育てよう'); expect(context.drawn).toBe('温泉を育てよう');
    await t.scanPromise;
});
it('preserves rule IDs and numeric data while collecting original nested format/name fields', () => {
    const data = { rules: JSON.stringify({ nodes: [{ id: 4, name: '石材', materials: { '407': 2 }, image: '石材画像' }], remainingFormat: '残り%1' }) };
    const before = JSON.stringify(data); const entries = new Map();
    collectMyDisplayParameters(data, entries);
    expect([...entries.keys()]).toEqual(['石材', '残り\\COT[0]']);
    expect(JSON.stringify(data)).toBe(before);
});
