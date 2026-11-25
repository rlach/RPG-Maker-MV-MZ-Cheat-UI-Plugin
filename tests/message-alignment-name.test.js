import { afterEach, expect, it, vi } from 'vitest';
import { MessageAlignCenterTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MessageAlignCenterTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function setup(parameters = {}, enabled = true) {
    class Base {
        convertEscapeCharacters(text) {
            return text
                .replace(/\\/g, '\x1b')
                .replace(/\x1bN\[1\]/gi, 'Hibito')
                .replace(/\x1bV\[2\]/gi, 'Hibito');
        }
        processEscapeCharacter(_code, textState) {
            // The native parameterless plugin measures the remaining line.
            this.measuredLine = textState.text.slice(textState.index);
        }
    }
    vi.stubGlobal('window', { Window_Base: Base, PluginManager: { parameters: () => parameters } });
    const translator = new MessageAlignCenterTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue({ isTranslationEnabled: () => enabled });
    vi.spyOn(translator, 'registerPluginCustomTags').mockImplementation(() => {});
    translator.enablePluginTranslation();
    return new Base();
}

it.each(['\\AC\\N[1]', '\\ac\\V[2]', '\\AR\\N[1]'])(
    'keeps the actor name separate from native alignment parsing: %s',
    (prefix) => {
        const window = setup();
        const converted = window.convertEscapeCharacters(
            prefix + ' and the others decided to return to the base.'
        );
        // RPG Maker obtains escape codes by consuming all adjacent Latin letters.
        const match = /^\x1b([A-Z]+)\[(\d+)\]/i.exec(converted);
        expect(match[1].toUpperCase()).toBe(prefix.slice(1, 3).toUpperCase());
        expect(Number(match[2])).toBe(0);
        expect(converted.slice(match[0].length)).toBe(
            'Hibito and the others decided to return to the base.'
        );
    }
);

it('preserves explicit shifts, unrelated tags, and source strings', () => {
    const window = setup();
    const source = '\\AC[20]\\N[1] \\C[2]test \\VC';
    expect(window.convertEscapeCharacters(source)).toBe('\x1bAC[20]Hibito \x1bC[2]test \x1bVC');
    expect(source).toBe('\\AC[20]\\N[1] \\C[2]test \\VC');
});

it.each(['\\AC不思議な迷宮', '\\AC---', '\\AR\\N[1]'])(
    'preserves native conversion when translation is disabled: %s',
    (source) => {
        const window = setup({}, false);
        expect(window.convertEscapeCharacters(source)).toBe(
            source.replace(/\\/g, '\x1b').replace(/\x1bN\[1\]/gi, 'Hibito')
        );
    }
);

it.each(['\\AC不思議な迷宮', '\\AC---', '\\AC\\N[1]'])(
    'does not measure or render the lexer delimiter as literal text: %s',
    (source) => {
        const window = setup();
        const text = window.convertEscapeCharacters(source);
        const code = /^\x1b([A-Z]+)/i.exec(text);
        const textState = { text, index: code[0].length };
        window.processEscapeCharacter(code[1], textState);
        expect(text.slice(textState.index)).not.toContain('[0]');
        expect(window.measuredLine).toBe(text.slice(textState.index));
    }
);

it('honors configured alignment escape symbols', () => {
    const window = setup({ escapeCharacterCenter: 'CENTER', escapeCharacterRight: 'RIGHT' });
    expect(window.convertEscapeCharacters('\\CENTER\\N[1]')).toBe('\x1bCENTER[0]Hibito');
});
