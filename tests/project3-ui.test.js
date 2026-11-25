import { it, expect, vi, afterEach } from 'vitest';
import { parseProject3Text, collectProject3Data } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/Project3TextCatalog.js';
import { Project3UiTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/Project3UiTranslator.js';
import { SourceTextCatalogTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('parses whole external dialogue, aliases, tutorial cues and home continuations without command or asset keys', () => {
    const rows = parseProject3Text('# comment\n【案内】\nし：こんにちは<改行>世界【表示:相場チャート】\n@effect shake | 揺れる | se=Wind\n@save');
    expect(rows).toContainEqual({ text: 'しづ江', cacheType: 'actor_name' });
    expect(rows).toContainEqual({ text: 'こんにちは\n世界', cacheType: 'message' });
    expect(rows.map(x => x.text)).not.toContain('shake');
    expect(parseProject3Text('[id] 題名\nわ：一行\n続き', 'ホーム会話.txt')).toContainEqual({ text: '一行\n続き', cacheType: 'message' });
    expect(parseProject3Text('[normal]\n{name}は攻撃！', 'BattleReactions.txt')[0]).toEqual({ text: '\\COT[0]は攻撃！', parts: ['', 'は攻撃！'], cacheType: 'message' });
});
it('extracts only display fields from external JSON and static tables', () => {
    const entries = new Map();
    collectProject3Data({ id: 'scene', image: '画像', steps: [{ speaker: '猫', text: 'こんにちは', se: 'Wind' }], randomTexts: ['雑談'], title: 'technical' }, entries);
    expect([...entries.keys()]).toEqual(['猫', 'こんにちは', '雑談']);
});
it('wraps the frozen dialogue API before deferred rendering, preserves caller state and tracks original namespaces', async () => {
    const pending = [];
    const original = Object.freeze({ draw(bitmap, options) { pending.push(() => { bitmap.text = options.text; bitmap.speaker = options.speaker; }); }, RECT: { width: 1120 } });
    class Text {}
    Object.defineProperty(Text.prototype, 'text', { configurable: true, get() { return this.value; }, set(value) { this.value = value; } });
    vi.stubGlobal('window', { Project3DialogueWindow: original, PIXI: { Text } });
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(true);
    const translator = new Project3UiTranslator();
    let enabled = true;
    const runtime = { maxLineWidth: 55, cleanTranslatedText: x => x, wrapText: x => x };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    vi.spyOn(translator, 'isRuntimeTranslationActive').mockImplementation(() => enabled);
    const calls = [];
    vi.spyOn(translator, 'resolveRuntimeTranslation').mockImplementation((source, _, types) => { calls.push([source, types]); return ({ 'こんにちは': 'Hello', '猫': 'Cat' })[source] || source; });
    vi.spyOn(translator, 'resolveText').mockImplementation(source => enabled && source === '建築' ? 'Construction' : source);
    translator.scanPromise = Promise.resolve();
    expect(translator.enablePluginTranslation()).toBe(true);
    const options = Object.freeze({ text: 'こんにちは', speaker: '猫' });
    const bitmap = {};
    window.Project3DialogueWindow.draw(bitmap, options);
    pending.shift()();
    expect(bitmap).toEqual({ text: 'Hello', speaker: 'Cat' });
    expect(options.text).toBe('こんにちは');
    expect(calls).toEqual([['こんにちは', ['message']], ['猫', ['actor_name']]]);
    const label = new Text(); label.text = '建築'; expect(label.text).toBe('Construction');
    label.text = label.text; expect(label.text).toBe('Construction');
    await translator.scanPromise;
    expect(label.text).toBe('Construction');
    enabled = false;
    window.Project3DialogueWindow.draw(bitmap, options); pending.shift()();
    expect(bitmap.text).toBe('こんにちは');
    expect(calls).toHaveLength(2);
    expect(window.Project3DialogueWindow.RECT).toBe(original.RECT);
});

it('keeps original namespaces and no pending duplicates after cached redraws and source rescans', async () => {
    const translator = new Project3UiTranslator();
    const rows = parseProject3Text('わ：こんにちは');
    for (const row of rows) translator.entries.set(row.text, row);
    const runtime = {
        enabled: true, isTranslationEnabled() { return this.enabled; },
        engine: { addPluginTags() {} },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([['message:こんにちは', 'Hello'], ['actor_name:わる子', 'Waruko']]),
        hasUsableCacheValue(key) { return this.translationCache.has(key); },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'registerPluginCustomTags').mockImplementation(() => {});
    for (let i = 0; i < 3; i++) expect(translator.resolveText('こんにちは', runtime)).toBe('Hello');
    expect(translator.resolveText('Hello', runtime)).toBe('Hello');
    for (const row of rows) translator.entries.set(row.text, row);
    expect(translator.collectUntranslated({ runtime })).toEqual([]);
    expect(runtime.trackCacheKeyUsage.mock.calls.map(call => call[0])).toEqual(Array(3).fill('message:こんにちは'));
    expect(translator.getPendingSourceEntries()).toContainEqual({ value: 'わる子', type: 'speaker' });
    runtime.enabled = false;
    expect(translator.resolveText('こんにちは', runtime)).toBe('こんにちは');
});
