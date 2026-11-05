import { afterEach, expect, it, vi } from 'vitest';
import { LanguageTranslationTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LanguageTranslationTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('removes translated reference delimiters in MV presentation while retaining native lookups and font controls', () => {
    const dictionary = { greeting: 'こんにちは' };
    const nativeTranslate = (text) =>
        text.replace(/\{([^{}]*)\}/g, (match, key) => dictionary[key] || match);
    class Base {
        drawText(text) {
            return nativeTranslate(text);
        }
        drawTextEx(text) {
            return this.convertEscapeCharacters(text);
        }
    }
    class Message extends Base {
        convertEscapeCharacters(text) {
            return nativeTranslate(text);
        }
    }
    vi.stubGlobal('window', {
        gl_translate: nativeTranslate,
        Window_Base: Base,
        Window_Message: Message,
    });
    const translator = new LanguageTranslationTranslator();
    let active = true;
    vi.spyOn(translator, 'isRuntimeTranslationActive').mockImplementation(() => active);
    expect(translator.enablePluginTranslation()).toBe(true);
    const message = new Message();
    expect(message.drawText('{greeting}')).toBe('こんにちは');
    expect(message.drawText('{Hello}')).toBe('Hello');
    expect(message.drawTextEx('{Hello\nthere}')).toBe('Hello\nthere');
    expect(message.convertEscapeCharacters('{Hello} \\{large\\}')).toBe('Hello \\{large\\}');
    expect(message.convertEscapeCharacters('\x1b{large\x1b}')).toBe('\x1b{large\x1b}');
    expect(window.gl_translate('{Hello}')).toBe('Hello');
    expect(dictionary).toEqual({ greeting: 'こんにちは' });
    active = false;
    expect(message.drawText('{Hello}')).toBe('{Hello}');
    expect(window.gl_translate('{greeting}')).toBe('こんにちは');
    expect(window.gl_translate('{Hello}')).toBe('{Hello}');
});

it('waits for the actual native localization API', () => {
    vi.stubGlobal('window', {});
    expect(new LanguageTranslationTranslator().enablePluginTranslation()).toBe(false);
});
