import { afterEach, expect, it, vi } from 'vitest';
import { ElleMenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ElleMenuTranslator.js';
import { SourceTextCatalogTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
import { extractJavaScriptTextCatalog } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('detects the earlier icon menu and scans event-script dialogue pools', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal(
        '$plugins',
        ['_Menu', '_Memo', '_Objects', '_Icon'].map((name) => ({ name, status: true }))
    );
    const translator = new ElleMenuTranslator();
    expect(translator.detectPlugin()).toBe(true);
    expect(translator.shouldScanEventData()).toBe(true);
    translator.extractCatalog = extractJavaScriptTextCatalog;
    translator.collectCommandTexts([
        { code: 355, parameters: ['$gameTemp._strings = ["こんにちは。"];'] },
    ]);
    expect(translator.entries.has('こんにちは。')).toBe(true);
});

it('translates late escape expansion and preserves the earlier scene-name rules', () => {
    vi.stubGlobal('window', globalThis);
    class Base {
        convertEscapeCharacters() {
            return 'こんにちは。';
        }
    }
    class Menu {
        callOkEvent() {}
    }
    class MapScene {
        createKaisouWindow() {
            this._kaisouWindow = new Menu();
        }
    }
    class System {
        upHParamByItemName(name) {
            return $dataItems.find((item) => item?.name === name);
        }
    }
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Window_MenuEx', Menu);
    vi.stubGlobal('Scene_Map', MapScene);
    vi.stubGlobal('Game_System', System);
    const item = { name: 'Panty flash', _translateOriginal: { name: 'パンチラ' } };
    vi.stubGlobal('$dataItems', [null, item]);
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(
        true
    );
    const translator = new ElleMenuTranslator();
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (text) => text === 'こんにちは。',
        translationCache: new Map([['こんにちは。', 'Hello.']]),
    };
    translator.entries.set('こんにちは。', { text: 'こんにちは。' });
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(new Base().convertEscapeCharacters('\\ST')).toBe('Hello.');
    expect(new System().upHParamByItemName('パンチラ')).toBe(item);
    expect(item.name).toBe('Panty flash');
});

it('dispatches native menu names without changing translated database objects', () => {
    const calls = [];
    const item = { name: 'Recollections', _translateOriginal: { name: '回想' }, meta: {} };
    class Menu {
        item() {
            return item;
        }
        callOkEvent() {
            calls.push(this.item().name);
        }
    }
    const translator = new ElleMenuTranslator();
    translator.installLogicHooks(Menu.prototype);
    const menu = new Menu();
    menu.callOkEvent();
    expect(calls).toEqual(['回想']);
    expect(menu.item()).toBe(item);
    expect(item.name).toBe('Recollections');
    for (const [native, translated] of [
        ['ヘルプ', 'Help'],
        ['ゲーム終了', 'Quit Game'],
    ]) {
        item.name = translated;
        item._translateOriginal.name = native;
        menu.callOkEvent();
        expect(calls.at(-1)).toBe(native);
    }
    class Recollection extends Menu {
        isEnabled(item) {
            return ['回想'].includes(item.name);
        }
        callOkEvent() {
            calls.push(this.item().name);
            throw new Error('event failed');
        }
    }
    translator.installLogicHooks(Recollection.prototype);
    item._translateOriginal.name = '回想';
    const recollection = new Recollection();
    expect(recollection.isEnabled(item)).toBe(true);
    expect(() => recollection.callOkEvent()).toThrow('event failed');
    expect(recollection.item()).toBe(item);
    expect(Object.hasOwn(recollection, 'item')).toBe(false);
});

it('collects multiline request metadata and evaluated special-status labels', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => ({
            ok: true,
            json: async () =>
                url.endsWith('Armors.json')
                    ? [
                          null,
                          {
                              note: '<MemoCommand><Id:1><Title:【盗賊退治】><Text:盗賊を退治してほしい。\n北にある小さな家だ。><Gold:20>',
                          },
                      ]
                    : { variables: ['', '口レベル'] },
        }))
    );
    const translator = new ElleMenuTranslator();
    await translator.collectAdditionalTexts();
    expect([...translator.entries.keys()]).toEqual(
        expect.arrayContaining([
            '【盗賊退治】',
            '盗賊を退治してほしい。\n北にある小さな家だ。',
            '盗賊を退治してほしい。',
            '北にある小さな家だ。',
            '口レベル',
        ])
    );
    expect(translator.entries.has('20')).toBe(false);
});
