import { afterEach, expect, it, vi } from 'vitest';
import { MessageAlignCenterTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MessageAlignCenterTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function setup(parameters = {}) {
    class Base {
        convertEscapeCharacters(text) {
            return text
                .replace(/\\/g, '\x1b')
                .replace(/\x1bN\[1\]/gi, 'Hibito')
                .replace(/\x1bV\[2\]/gi, 'Hibito');
        }
    }
    vi.stubGlobal('window', { Window_Base: Base, PluginManager: { parameters: () => parameters } });
    const translator = new MessageAlignCenterTranslator();
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

it('honors configured alignment escape symbols', () => {
    const window = setup({ escapeCharacterCenter: 'CENTER', escapeCharacterRight: 'RIGHT' });
    expect(window.convertEscapeCharacters('\\CENTER\\N[1]')).toBe('\x1bCENTER[0]Hibito');
});
