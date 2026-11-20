import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MultiLanguageTranslationTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MultiLanguageTranslationTranslator.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../cheat-engine/www/cheat/translate-engines/plugins/PluginTranslatorRegistry.js';
import { buildPluginTraversalOptions } from '../cheat-engine/www/cheat/translate-engines/plugins/PluginMessageEntryNormalizer.js';
import { collectEventCommandEntries } from '../cheat-engine/www/cheat/js/EventCommandTraversal.js';
let translator, localization;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    const data = { '废弃的箱子。': '捨てられた箱か。', '第二行。': '二行目。', '健': 'ケン', '查看': '調べる', '捨てられた箱か。': 'Do not translate twice' };
    localization = { currentLang: 'ja', translate(text) { return this.currentLang === 'zh' ? text : data[text] || text; } };
    vi.stubGlobal('__Translation', localization);
    translator = new MultiLanguageTranslationTranslator();
    vi.spyOn(translator, 'isActive').mockReturnValue(true);
    vi.spyOn(PLUGIN_TRANSLATOR_REGISTRY, 'getDetectedTranslatorInstances').mockReturnValue([translator]);
    vi.spyOn(PLUGIN_TRANSLATOR_REGISTRY, 'ensureDetectionStarted').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('collects the screenshot message under the same source as native runtime localization', () => {
    const list = [
        { code: 101, parameters: ['', 0, 0, 2, '健'] },
        { code: 401, parameters: ['废弃的箱子。'] },
        { code: 401, parameters: ['第二行。'] },
        { code: 102, parameters: [['查看'], 0, 0, 2, 0] },
    ];
    const original = structuredClone(list);
    const entries = collectEventCommandEntries(list, buildPluginTraversalOptions({}));
    expect(entries.map(({ type, value }) => ({ type, value }))).toEqual([
        { type: 'speaker', value: 'ケン' },
        { type: 'message', value: '捨てられた箱か。\n二行目。' },
        { type: 'choice', value: '調べる' },
    ]);
    expect(entries[1].value).toBe(list.slice(1, 3).map(c => localization.translate(c.parameters[0])).join('\n'));
    expect(list).toEqual(original);
});
it('preserves portrait keys, blank lines, untranslated text and native language selection', () => {
    const entry = { value: '废弃的箱子。\n\nUnknown', type: 'message_portrait' };
    expect(translator.normalizeTranslationEntry(entry).value).toBe('捨てられた箱か。\n\nUnknown');
    localization.currentLang = 'zh';
    expect(translator.normalizeTranslationEntry(entry).value).toBe(entry.value);
});
it('does not localize runtime Japanese a second time or require the native object to exist', () => {
    expect(translator.resolveMessageCacheSourceText({ text: '捨てられた箱か。', mode: 'runtime' })).toBeNull();
    vi.stubGlobal('__Translation', undefined);
    expect(translator.enablePluginTranslation()).toBe(false);
    expect(translator.localizeLines('废弃的箱子。')).toBe('废弃的箱子。');
});
it('respects disabled plugin settings for non-message entries', () => {
    translator.isActive.mockReturnValue(false);
    const entry = { type: 'choice', value: '查看' };
    expect(translator.normalizeTranslationEntry(entry, {})).toBe(entry);
});

