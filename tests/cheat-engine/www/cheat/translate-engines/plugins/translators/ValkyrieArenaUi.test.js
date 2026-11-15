import { afterEach, expect, it, vi } from 'vitest';
import { ValkyrieArenaTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ValkyrieArenaTranslator.js';
import { TorigoyaMZBookshelfTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TorigoyaMZBookshelfTranslator.js';
import { SceneCustomMenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SceneCustomMenuTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('collects text variable assignments and dependencies without changing gameplay variables or adding picture names', async () => {
    const parameters = {
        Scene4: JSON.stringify({ Id: 'Scene_Skillset' }),
        Scene8: JSON.stringify({ Id: 'Scene_VS' }),
        Scene1: JSON.stringify({
            WindowList: JSON.stringify([
                JSON.stringify({ ListScript: '$gameVariables.value(10)', ItemDrawScript: '' }),
                JSON.stringify({
                    ListScript: '$gameVariables.value(20)',
                    ItemDrawScript: JSON.stringify(['this.drawPicture(item, 0, 0)']),
                }),
            ]),
        }),
    };
    vi.stubGlobal('window', { $plugins: [{ name: 'SceneCustomMenu', status: true, parameters }] });
    const t = new ValkyrieArenaTranslator();
    expect(t.detectPlugin()).toBe(true);
    t.collectCommandTexts([
        { code: 122, parameters: [10, 10, 0, 1, 11] },
        { code: 122, parameters: [11, 11, 0, 4, "'スー'"] },
        { code: 122, parameters: [20, 20, 0, 4, "'画像ファイル'"] },
        { code: 122, parameters: [30, 30, 0, 4, "'信頼度30%以上'"] },
        { code: 357, parameters: ['DTextPicture', 'dText', '', { text: 'Condition: \\v[30]' }] },
    ]);
    await t.collectAdditionalTexts();
    expect([...t.entries.keys()]).toEqual(['スー', '信頼度30%以上']);
    class Base {
        convertEscapeCharacters(text) {
            return text.replace('\\v[10]', 'スー');
        }
        drawText(text) {
            return text;
        }
    }
    window.Window_Base = Base;
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        hasUsableCacheValue: (key) => key === 'スー',
        translationCache: new Map([['スー', 'Sue']]),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(runtime);
    vi.spyOn(t, 'precomputeCounts').mockResolvedValue();
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Base().convertEscapeCharacters('\\v[10]')).toBe('Sue');
    expect(new Base().drawText('スー')).toBe('Sue');
    expect(runtime.trackCacheKeyUsage.mock.calls.every(([key]) => key === 'スー')).toBe(true);
});
it('collects note fields referenced by drawNoteText, including multiline Breaker descriptions', async () => {
    const t = new SceneCustomMenuTranslator();
    const scene = {
        Id: 'Scene_Test',
        WindowList: JSON.stringify([
            JSON.stringify({
                ItemDrawScript: JSON.stringify(["this.drawNoteText('noteValue', r.x, r.y)"]),
            }),
        ]),
    };
    vi.stubGlobal('window', {
        $plugins: [{ name: 'SceneCustomMenu', parameters: { Scene1: JSON.stringify(scene) } }],
    });
    vi.spyOn(t, '_loadActorSourceNames').mockResolvedValue();
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => ({
            ok: true,
            json: async () =>
                url === 'data/Armors.json'
                    ? [null, { id: 26, note: '<noteValue:非生物を破壊出来る\n斧を召喚\n>' }]
                    : [],
        }))
    );
    const entries = await t.buildScanEntries();
    expect(entries.some((entry) => entry.text === '非生物を破壊出来る\n斧を召喚')).toBe(true);
});
it('loads external bookshelf pages and translates private content windows using original full pages', async () => {
    const page = 'カイラン諸島出身。\n王女として育った。';
    const book = {
        title: '',
        books: [{ title: 'プロフィール', condition: 's[1]', pages: [page] }],
    };
    class Parser {
        parse() {
            return book;
        }
    }
    class Base {
        drawTextEx(text) {
            return text;
        }
    }
    class Window_BookContent extends Base {}
    vi.stubGlobal('window', {
        $plugins: [{ name: 'TorigoyaMZ_Bookshelf', parameters: {} }],
        Torigoya: { Bookshelf: { TextParser: Parser } },
        Window_Base: Base,
    });
    const fetcher = vi.fn(async () => ({ ok: true, text: async () => 'source file' }));
    vi.stubGlobal('fetch', fetcher);
    const t = new TorigoyaMZBookshelfTranslator();
    t.collectCommandTexts([
        {
            code: 357,
            parameters: ['TorigoyaMZ_Bookshelf', 'openBookshelf', '', { fileName: 'Sue' }],
        },
    ]);
    await t.collectAdditionalTexts();
    expect(fetcher).toHaveBeenCalledWith('bookshelf/Sue.txt');
    expect([...t.entries.keys()]).toEqual(['プロフィール', page]);
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => true,
        translationCache: new Map([[page, 'A princess from the islands.']]),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Window_BookContent().drawTextEx(page)).toBe('A princess from the islands.');
    expect(book.books[0].pages[0]).toBe(page);
    expect(book.books[0].condition).toBe('s[1]');
});
