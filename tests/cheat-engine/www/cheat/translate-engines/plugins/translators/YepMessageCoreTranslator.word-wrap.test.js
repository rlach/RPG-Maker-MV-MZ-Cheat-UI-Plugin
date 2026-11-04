import { afterEach, expect, it, vi } from 'vitest';
import { YepMessageCoreTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/YepMessageCoreTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('uses authored keys for YEP-injected word wrap while preserving both wrapping plugins at rendering', () => {
    vi.stubGlobal('window', globalThis);
    let wrap = true;
    vi.stubGlobal('$gameSystem', { wordWrap: () => wrap });
    const translator = new YepMessageCoreTranslator();
    const runtime = { isTranslationEnabled: () => true };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    vi.spyOn(translator, 'registerPluginCustomTags').mockImplementation(() => {});
    const seen = [];
    class Message {
        constructor() {
            this._texts = [];
        }
        add(text) {
            seen.push(
                translator.resolveMessageCacheSourceText({ text, gameMessage: this }) ?? text
            );
            this._texts.push(text);
        }
        addText(text) {
            if (wrap) text = '<WordWrap>' + text;
            this.add(text);
        }
        clear() {
            this._texts = [];
        }
    }
    class MessageWindow {
        convertEscapeCharacters(text) {
            this.wrapped = /<WordWrap>/i.test(text);
            return text.replace(/<WordWrap>/gi, '');
        }
    }
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    expect(translator.enablePluginTranslation()).toBe(true);
    const message = new Message();
    vi.stubGlobal('$gameMessage', message);
    const source =
        '\\N<勇人>ブラックナイトゲームは動画共有プラットフォーム「UTube」で見れる動画コンテンツの1つだよ。<wrap>';
    const translated = '\\N<Hayato>You can watch the Black Knight Game on UTube.<wrap>';
    const cache = new Map([[source, translated]]);
    message.addText(source);
    expect(seen).toEqual([source]);
    expect(message._texts).toEqual(['<WordWrap>' + source]);
    const key = translator.resolveMessageCacheSourceText({ text: message._texts.join('\n') });
    expect(cache.get(key)).toBe(translated);
    expect(cache.size).toBe(1);
    const window = new MessageWindow();
    expect(window.convertEscapeCharacters(cache.get(key))).toBe(translated);
    expect(window.wrapped).toBe(true);
    expect(window.convertEscapeCharacters('<WordWrap>First word<br>Second word<wrap>')).toBe(
        'First word\nSecond word'
    );
    expect(window.wrapped).toBe(false);
    expect(window._wordWrap).toBe(false);
    expect(
        translator.resolveMessageCacheSourceText({
            text: '<WordWrap>' + source,
            mode: 'collection',
        })
    ).toBeNull();
    message.addText('次の行');
    expect(translator.resolveMessageCacheSourceText({ text: message._texts.join('\n') })).toBe(
        source + '\n次の行'
    );
    message.clear();
    expect(translator.resolveMessageCacheSourceText({ text: '<WordWrap>' + source })).toBeNull();
    message.addText('<WordWrap>' + source);
    expect(translator.resolveMessageCacheSourceText({ text: message._texts[0] })).toBe(
        '<WordWrap>' + source
    );
    message.clear();
    wrap = false;
    message.addText(source);
    expect(translator.resolveMessageCacheSourceText({ text: source })).toBeNull();
});
