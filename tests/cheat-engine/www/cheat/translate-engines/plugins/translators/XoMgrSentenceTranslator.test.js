import { afterEach, expect, it, vi } from 'vitest';
import { XoMgrSentenceTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/XoMgrSentenceTranslator.js';
import { extractJavaScriptTextCatalog } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('scans all scene sentences and resolves rotating variable dialogue through normal message entry points', () => {
    vi.stubGlobal('window', globalThis);
    const translator = new XoMgrSentenceTranslator();
    translator.extractCatalog = extractJavaScriptTextCatalog;
    const first = '【ベルナデッタ】\nそうそう、奴隷になにか拘るポイントはあるかい？';
    const second = '\n\\>\\c[4]※これからアナタの最初の仲間になる娘を選んでもらいます。';
    const catalog = translator.collectSourceCatalog(
        `MakeSentence_J = function(scene) { switch(scene) {
            case "op2": SetSentenceList([${JSON.stringify(first)}, ${JSON.stringify(second)}, 0]); break;
            case "RoomMenu": SetSentenceList(["一日を終えて翌日の営業を開始します。", 0]); break;
        } };`
    );
    for (const entry of catalog.entries) translator.entries.set(entry.text, entry);
    expect(translator.entries.has(first)).toBe(true);
    expect(translator.entries.has(second)).toBe(true);
    expect(translator.entries.has('一日を終えて翌日の営業を開始します。')).toBe(true);
    vi.stubGlobal('$gameVariables', { _data: { 510: first, 511: second, 42: 'Unrelated value' } });
    const key = (text, type) => `${type}:${text}`;
    const used = vi.fn();
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: {},
        translationCache: new Map([
            [key(first, translator.getCacheType()), 'Bernadetta: Any preferences?'],
        ]),
        getCacheKey: key,
        getMessageCacheKey: (text) => key(text, 'message'),
        getMessageCacheLookupKeys: (text) => [key(text, 'message')],
        hasUsableCacheValue(cacheKey) {
            return this.translationCache.has(cacheKey);
        },
        trackCacheKeyUsage: used,
        setCacheValue(cacheKey, value) {
            this.translationCache.set(cacheKey, value);
        },
    };
    translator.tagEngine = runtime.engine;
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    class BaseWindow {
        drawText() {}
        drawTextEx() {}
        convertEscapeCharacters(text) {
            return text;
        }
    }
    class Bitmap {
        drawText() {}
    }
    class Message {
        _texts = [];
        add(text) {
            this._texts.push(text);
        }
        faceName() {
            return '';
        }
    }
    class MessageWindow {
        startMessage() {
            return $gameMessage._texts.join('\n');
        }
    }
    vi.stubGlobal('Window_Base', BaseWindow);
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    const button = { value: '　決　定　' };
    vi.stubGlobal('document', { querySelectorAll: () => [button] });
    class Interpreter {
        command355(shouldThrow = false) {
            if (shouldThrow) throw new Error('script failed');
            const index = $dataMapInfos.findIndex((map) => map?.name === '00_マイルーム');
            if (index >= 0) $gameVariables._data[1] = index;
            return $gameVariables._data[1];
        }
        pluginCommand(name, args) {
            return { name, args };
        }
        _inputForm() {
            return 'form opened';
        }
    }
    vi.stubGlobal('Game_Interpreter', Interpreter);
    const message = new Message();
    vi.stubGlobal('$gameMessage', message);
    expect(translator.enablePluginTranslation()).toBe(true);
    const maps = [
        null,
        ...Array(6).fill(null),
        {
            id: 7,
            name: '00_My Room',
            _translateOriginal: { name: '00_マイルーム' },
        },
    ];
    vi.stubGlobal('$dataMapInfos', maps);
    $gameVariables._data[1] = 200;
    expect(new Interpreter().command355()).toBe(7);
    expect($dataMapInfos).toBe(maps);
    expect($dataMapInfos[7].name).toBe('00_My Room');
    expect(() => new Interpreter().command355(true)).toThrow('script failed');
    expect($dataMapInfos).toBe(maps);
    message.add('\\v[510]');
    expect(translator.resolveMessageCacheSourceText({ text: '\\v[510]', runtime })).toBe(first);
    expect(runtime.getMessageCacheLookupKeys(first)).toContain(
        key(first, translator.getCacheType())
    );
    expect(new MessageWindow().startMessage()).toBe('Bernadetta: Any preferences?');
    expect(message._texts).toEqual(['\\v[510]']);
    expect(used).toHaveBeenCalledWith(key(first, translator.getCacheType()), {
        harvestMissing: true,
    });
    expect(runtime.translationCache.has(key('\\v[510]', 'message'))).toBe(false);
    expect(new BaseWindow().convertEscapeCharacters('\\v[510]')).toBe(
        'Bernadetta: Any preferences?'
    );
    const confirm = '　決　定　';
    translator.entries.set(confirm, { text: confirm });
    runtime.translationCache.set(key(confirm, translator.getCacheType()), 'Confirm');
    expect(new Interpreter()._inputForm()).toBe('form opened');
    expect(button.value).toBe('Confirm');
    expect(new Interpreter().pluginCommand('D_TEXT', [confirm, '26']).args).toEqual([
        'Confirm',
        '26',
    ]);
    $gameVariables._data[510] = second;
    expect(translator.resolveMessageCacheSourceText({ text: '\\V[510]', runtime })).toBe(second);
    message._texts = [];
    message.add('\\V[510]');
    expect(runtime.translationCache.has(key(second, 'message'))).toBe(false);
    expect(translator.sourceText('\\V[42]')).toBe('\\V[42]');
    expect(
        translator.resolveMessageCacheSourceText({ text: '\\V[510]', runtime, mode: 'collection' })
    ).toBeNull();
    runtime.enabled = false;
    expect(translator.resolveMessageCacheSourceText({ text: '\\V[510]', runtime })).toBeNull();
    expect(new MessageWindow().startMessage()).toBe('\\V[510]');
    expect($gameVariables._data[510]).toBe(second);
});

it('collects external scenario messages with native actor macros and line boundaries', () => {
    const translator = new XoMgrSentenceTranslator();
    translator.collectScenarioText(
        [
            '※/comment',
            'CG/portrait.png',
            '文章/枠/【[名前]】/えっとぉ、初めまして。[名前]です。/',
            '　文章/暗//[主人公]と[相手]、[呼名]と[私]。',
        ].join('\r\n')
    );
    expect([...translator.entries.keys()]).toEqual([
        '【\\n[2]】\nえっとぉ、初めまして。\\n[2]です。\n',
        '\n\\n[1]と\\n[2]、\\n[3]と\\n[13]。',
    ]);
});
