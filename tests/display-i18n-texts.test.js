import { afterEach, expect, it, vi } from 'vitest';
import { DisplayI18nTextsTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/DisplayI18nTextsTranslator.js';
import {
    resolveDisplayI18nSource,
    setDisplayI18nSourceDictionary,
} from '../cheat-engine/www/cheat/js/translation-runtime/NativeI18nSource.js';
import { readFileSync } from 'node:fs';
const keySource = readFileSync(
    'cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyCoreMethods.js',
    'utf8'
).match(/    getCacheKey\(text, type\) \{[\s\S]*?\n    \},/)[0];
const getCacheKey = new Function('resolveDisplayI18nSource', `return ({${keySource}}).getCacheKey`)(
    resolveDisplayI18nSource
);
afterEach(() => {
    vi.unstubAllGlobals();
    setDisplayI18nSourceDictionary(undefined);
});
function setup() {
    const dictionary = [
        { ja_JP: '明子', en_US: 'Akiko' },
        { ja_JP: 'うんしょ。', en_US: 'Heave-ho.' },
        { ja_JP: 'アイテム', en_US: 'Items' },
        { ja_JP: '\\I18N[1]', en_US: '\\I18N[1]' },
    ];
    class Message {
        allText() {
            return '\\I18N[1]';
        }
        speakerName() {
            return '\\I18N[0]';
        }
        choices() {
            return ['\\I18N[2]'];
        }
    }
    vi.stubGlobal('window', {
        $plugins: [{ name: 'DisplayI18NTexts', status: true }],
        $dataI18nTexts: dictionary,
        TextManager: {
            translate: (t) => t.replace(/\\I18N\[(\d+)\]/g, (_, id) => dictionary[id].en_US),
        },
        Game_Message: Message,
    });
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => JSON.stringify(dictionary),
    }));
    const cache = new Map();
    const runtime = {
        sourceLang: 'ja',
        targetLang: 'en',
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey,
        translationCache: cache,
        hasUsableCacheValue: (key) => cache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    const t = new DisplayI18nTextsTranslator();
    t.getRuntime = () => runtime;
    return { t, runtime, cache, Message };
}
it('expands all typed cache keys and dictionary catalog values without leaking I18N tokens', async () => {
    const { t, runtime } = setup();
    await t.precomputeCounts();
    for (const type of ['actor_name', 'command', 'message', 'choice', 'item_name'])
        expect(runtime.getCacheKey('\\I18N[0]', type)).toBe(`${type}:ja-en-明子`);
    const entries = t.collectUntranslated({ runtime });
    expect(entries.map((e) => e.value)).toEqual(['明子', 'うんしょ。', 'アイテム']);
    expect(entries.some((e) => e.cacheKey.includes('I18N['))).toBe(false);
    expect(
        t.normalizeTranslationEntry({ type: 'item_name', value: '\\I18N[2]' }, { runtime }).value
    ).toBe('アイテム');
    expect(resolveDisplayI18nSource('\\I18N[1]\n\\I18N[2]', runtime)).toBe('うんしょ。\nアイテム');
});
it('localizes native display and runtime dialogue while preserving selected-language behavior when off', async () => {
    const { t, runtime, cache, Message } = setup();
    expect(t.enablePluginTranslation()).toBe(true);
    await t.sourcePromise;
    cache.set('plugin_display_i18n_texts:ja-en-明子', 'Akiko');
    expect(window.TextManager.translate('\\I18N[0]')).toBe('Akiko');
    expect(new Message().allText()).toBe('うんしょ。');
    expect(new Message().speakerName()).toBe('明子');
    expect(new Message().choices()).toEqual(['アイテム']);
    runtime.enabled = false;
    expect(window.TextManager.translate('\\I18N[0]')).toBe('Akiko');
    expect(new Message().allText()).toBe('\\I18N[1]');
});
it('does not interpret unrelated games and terminates cyclic references', () => {
    const { runtime } = setup();
    window.$dataI18nTexts[3].ja_JP = '\\I18N[3]';
    expect(resolveDisplayI18nSource('\\I18N[3]', runtime)).toBe('\\I18N[3]');
    window.$plugins = [];
    expect(resolveDisplayI18nSource('\\I18N[0]', runtime)).toBe('\\I18N[0]');
});
