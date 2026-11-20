import { afterEach, expect, it, vi } from 'vitest';
import { HbCaseUiTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/HbCaseUiTranslator.js';
import { extractJavaScriptTextCatalog } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';
afterEach(() => vi.unstubAllGlobals());
function setup() {
    class Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return this.convertEscapeCharacters(text);
        }
        convertEscapeCharacters(text) {
            return text.replace(/\\v\[105\]/gi, '筋力').replace(/\\/g, '\x1b');
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
    class Phone {
        loadSnsContents(topic) {
            this.rendered = topic._posts.map((post) => post.content.texts.join('\n'));
            return topic;
        }
    }
    vi.stubGlobal('window', {
        Window_Base: Base,
        Bitmap,
        Window_Message: Message,
        Game_Message: GameMessage,
        Scene_SNS: Phone,
    });
    const cache = new Map();
    const runtime = {
        enabled: true,
        engine: {},
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (s, type) => `${type}:${s}`,
        translationCache: cache,
        hasUsableCacheValue: (key) => cache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    const t = new HbCaseUiTranslator();
    t.getRuntime = () => runtime;
    t.registerPluginCustomTags = () => {};
    t.precomputeCounts = async () => {};
    t.extractCatalog = extractJavaScriptTextCatalog;
    return { t, runtime, cache, Base, Phone };
}
it('harvests SNS posts, speaker/group/topic assignments and weekday variants without evaluating expressions', () => {
    const { t } = setup();
    t.collectCommandTexts([
        { code: 122, parameters: [6, 6, 0, 4, "'学校のみんな'"] },
        { code: 122, parameters: [8, 8, 0, 4, "'カラオケ'"] },
        { code: 122, parameters: [33, 33, 0, 4, "'月'"] },
        { code: 101, parameters: [] },
        { code: 401, parameters: ['なー今度俊介とたくみと'] },
        { code: 401, parameters: ['カラオケ行くけど'] },
        { code: 401, parameters: ['誰か一緒に行く人ー？'] },
    ]);
    expect([...t.entries.keys()]).toEqual(
        expect.arrayContaining([
            '学校のみんな',
            'カラオケ',
            '月曜日',
            'なー今度俊介とたくみと\nカラオケ行くけど\n誰か一緒に行く人ー？',
        ])
    );
});
it('localizes expanded temporary display values and stat output without rewriting game variables', () => {
    const { t, cache, Base, runtime } = setup();
    t.entries.set('筋力', { text: '筋力' });
    cache.set('plugin_hb_case_ui:筋力', 'Strength');
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Base().drawTextEx('\\v[105]')).toBe('Strength');
    expect(new Base().drawText('筋力')).toBe('Strength');
    expect(new Base().drawText('100')).toBe('100');
    runtime.enabled = false;
    expect(new Base().drawTextEx('\\v[105]')).toBe('筋力');
});
it('renders complete SNS translations using copies while preserving route keys and stored posts', () => {
    const { t, cache, Phone, runtime } = setup();
    const source = 'なー今度\nカラオケ行くけど';
    cache.set(`message:${source}`, 'Want to go\nto karaoke?');
    expect(t.enablePluginTranslation()).toBe(true);
    const post = {
        name: 'けんた',
        type: 'text',
        height: 90,
        content: { texts: source.split('\n') },
    };
    const topic = { name: 'カラオケ', _posts: [post] };
    const phone = new Phone();
    const display = phone.loadSnsContents(topic);
    expect(phone.rendered).toEqual(['Want to go\nto karaoke?']);
    expect(topic._posts[0]).toBe(post);
    expect(post.content.texts.join('\n')).toBe(source);
    expect(display.name).toBe('カラオケ');
    expect(display._posts[0].name).toBe('けんた');
    runtime.enabled = false;
    phone.loadSnsContents(topic);
    expect(phone.rendered).toEqual([source]);
});
