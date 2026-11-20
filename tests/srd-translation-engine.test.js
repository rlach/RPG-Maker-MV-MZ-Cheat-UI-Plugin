import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SrdTranslationEngineTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/SrdTranslationEngineTranslator.js';
let translator, runtime, active, language, data, files;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    active = true; language = 'Japanese';
    data = {
        msg: { '你好\n雅典娜': { Japanese: 'こんにちは\nアテナ' }, '下一頁': { Japanese: '次のページ' } },
        cmd: { '是': { Japanese: 'はい' }, '否': { Japanese: 'いいえ' }, '裝備': { Japanese: '装備' } },
        terms: { 'message-saveMessage': { Japanese: 'どちらに保存しますか？' }, 'message-file': { Japanese: 'ファイル' }, 'param-2': { Japanese: '攻撃' } },
        custom: { Japanese: { '武器': '武器', '盾牌': '盾' } },
    };
    vi.stubGlobal('$dataTranslations', data);
    vi.stubGlobal('ConfigManager', { isDefaultLanguage: () => language === null, getLanguage: () => language });
    vi.stubGlobal('SRD', { TranslationEngine: {
        translate(text) { return language && data.custom[language]?.[text] || text; },
        parseNoteData(row) {
            for (const m of (row.note || '').matchAll(/<(\w+) Translation>\n\[(\w+)\]:(.*?)\n<\/\1 Translation>/gs)) {
                row._tt_translations ||= {}; row._tt_translations[m[1]] ||= {}; row._tt_translations[m[1]][m[2]] = m[3];
            }
        },
    } });
    vi.stubGlobal('TextManager', { basic: () => 'Lv', param: () => '攻撃', message: id => data.terms['message-'+id]?.Japanese || id });
    class Message { setChoices(choices, defaultType, cancelType) { this._choices = choices; this.args = [defaultType, cancelType]; } }
    vi.stubGlobal('Game_Message', Message);
    runtime = { isTranslationEnabled: () => active, getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map(), hasUsableCacheValue(key) { return this.translationCache.has(key); }, trackCacheKeyUsage: vi.fn() };
    translator = new SrdTranslationEngineTranslator(); translator.getRuntime = () => runtime; translator.isActive = () => true;
    files = {
        Actors: [null, { id: 1, name: '雅典娜', note: '<Japanese Translation>\n[name]:アテナ\n</Japanese Translation>' }],
        Weapons: [null, { id: 1, name: '鐵劍', description: '劍', note: '<Japanese Translation>\n[name]:鉄剣\n</Japanese Translation>' }],
        System: { terms: { params: ['最大HP', '最大MP', '攻擊'], messages: { saveMessage: '要存哪裡？', file: '檔案' }, commands: ['裝備'] } },
        CommonEvents: [null], MapInfos: [null, { id: 1 }],
        Map001: { events: [null, { pages: [{ list: [
            { code: 101, parameters: ['Actor1', 0, 0, 2, ''] }, { code: 401, parameters: ['你好'] }, { code: 401, parameters: ['雅典娜'] },
            { code: 102, parameters: [['是','否']] }, { code: 101, parameters: ['',0,0,2,''] }, { code: 401, parameters: ['下一頁'] },
        ] }] }] },
    };
    translator.readData = async name => structuredClone(files[name] || []);
});
afterEach(() => vi.unstubAllGlobals());
it('collects native localized messages, portrait keys, choices, terms and note-backed database fields', async () => {
    const snapshot = structuredClone({ data, files });
    await translator.precomputeCounts(); // Also works before runtime hooks are enabled.
    const pending = translator.collectUntranslated({ runtime });
    expect(pending).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'message_portrait', value: 'こんにちは\nアテナ' }),
        expect.objectContaining({ type: 'message', value: '次のページ' }),
        expect.objectContaining({ type: 'choice', value: 'はい' }),
        expect.objectContaining({ type: 'actor_name', value: 'アテナ' }),
        expect.objectContaining({ type: 'weapon_name', value: '鉄剣' }),
        expect.objectContaining({ value: '攻撃' }),
        expect.objectContaining({ value: 'どちらに保存しますか？' }),
    ]));
    expect(pending.some(p => p.type === 'message' && p.value === 'こんにちは\nアテナ')).toBe(false);
    expect({ data, files }).toEqual(snapshot);
    expect(translator.normalizeTranslationEntry({ type: 'message_portrait', value: '你好\n雅典娜' }, { runtime }).value).toBe('こんにちは\nアテナ');
    expect(translator.resolveMessageCacheSourceText({ text: 'こんにちは\nアテナ', mode: 'runtime' })).toBe('こんにちは\nアテナ');
});
it('translates save/status/equipment output without replacing native getters or changing dictionaries', async () => {
    const original = structuredClone(data);
    const actor = {}; Object.defineProperty(actor, 'name', { get: () => 'アテナ', set() {}, configurable: true });
    const getter = Object.getOwnPropertyDescriptor(actor, 'name').get;
    translator.enablePluginTranslation(); await translator.precomputeCounts();
    for (const [type, source, translated] of [['actor_name','アテナ','Athena'], ['weapon_name','鉄剣','Iron Sword'],
        ['plugin_srd_translation_engine','どちらに保存しますか？','Where would you like to save?'],
        ['plugin_srd_translation_engine','ファイル','File'], ['plugin_srd_translation_engine','攻撃','Attack']])
        runtime.translationCache.set(`${type}:${source}`, translated);
    actor.name = 'Ignored write';
    expect(actor.name).toBe('アテナ');
    expect(SRD.TranslationEngine.translate(actor.name)).toBe('Athena');
    expect(SRD.TranslationEngine.translate('鉄剣')).toBe('Iron Sword');
    expect(TextManager.param(2)).toBe('Attack');
    expect(TextManager.message('saveMessage')).toBe('Where would you like to save?');
    expect(TextManager.message('file') + '1').toBe('File1');
    expect(Object.getOwnPropertyDescriptor(actor, 'name').get).toBe(getter);
    expect(data).toEqual(original); expect(language).toBe('Japanese');
    const calls = runtime.trackCacheKeyUsage.mock.calls.length;
    expect(SRD.TranslationEngine.translate('0')).toBe('0');
    expect(SRD.TranslationEngine.translate(1000)).toBe(1000);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(calls);
    active = false; expect(SRD.TranslationEngine.translate(actor.name)).toBe('アテナ');
});
it('localizes choices before the core freezes source keys and leaves IDs and source arrays intact', async () => {
    translator.enablePluginTranslation(); await translator.precomputeCounts();
    const choices = ['是','否']; const message = new Game_Message();
    message.setChoices(choices, 0, -2);
    expect(message._choices).toEqual(['はい','いいえ']); expect(message.args).toEqual([0,-2]); expect(choices).toEqual(['是','否']);
    const entry = translator.normalizeTranslationEntry({ type: 'choice', value: '是' }, { runtime });
    expect(entry.value).toBe('はい'); expect(translator.normalizeTranslationEntry(entry, { runtime })).toBe(entry);
});
it('reuses legacy authored-source caches and respects native language selection', async () => {
    await translator.precomputeCounts(); runtime.translationCache.set('weapon_name:鐵劍', 'Iron Sword');
    expect(translator.resolveDisplay('鉄剣')).toBe('Iron Sword');
    language = null;
    expect(translator.resolveMessageCacheSourceText({ text: '你好\n雅典娜' })).toBe('你好\n雅典娜');
    await translator.precomputeCounts();
    expect(translator.entries.has('雅典娜')).toBe(true);
});
it('scans a detached dictionary before native data initialization without publishing or mutating it', async () => {
    files.Translations = data;
    vi.stubGlobal('$dataTranslations', null);
    await translator.precomputeCounts();
    expect(translator.entries.get('こんにちは\nアテナ').types.has('message_portrait')).toBe(true);
    expect(translator.entries.has('こんにちは\nアテナ')).toBe(true);
    expect(translator.nativeCustom('盾牌')).toBe('盾');
    expect(window.$dataTranslations).toBeNull();
});

it('localizes each collected message once even when a localized value is another native key', async () => {
    data.msg['こんにちは\nアテナ'] = { Japanese: 'Do not follow this key' };
    const entry = translator.normalizeTranslationEntry({ type: 'message_portrait', value: '你好\n雅典娜' }, { runtime });
    expect(entry.value).toBe('こんにちは\nアテナ');
    expect(translator.normalizeTranslationEntry(entry, { runtime })).toBe(entry);
    expect(translator.resolveMessageCacheSourceText({ text: entry.value, mode: 'collection' })).toBe(entry.value);
    expect(translator.resolveMessageCacheSourceText({ text: entry.value, mode: 'runtime' })).toBe(entry.value);
});
