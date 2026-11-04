import { afterEach, expect, it, vi } from 'vitest';
import { LLStandingPictureTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LLStandingPictureTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('hides nested variable picture controls without changing native portrait input or cache keys', () => {
    vi.stubGlobal('window', globalThis);
    let enabled = true;
    class BaseWindow {
        convertEscapeCharacters(text) {
            // LL v2.6.3 filters simple IDs before the engine expands variables.
            return text
                .replace(/\\(?:F{1,4}|M{1,4}|AA|FH)\[\w+\]/gi, '')
                .replace(/\\V\[101\]/gi, '0')
                .replace(/\\/g, '\x1b');
        }
    }
    vi.stubGlobal('Window_Base', BaseWindow);
    const translator = new LLStandingPictureTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue({
        isTranslationEnabled: () => enabled,
    });
    vi.spyOn(translator, 'registerPluginCustomTags').mockImplementation(() => {});
    expect(translator.enablePluginTranslation()).toBe(true);
    const controls = '\\F[\\V[101]satie_komariA]\\FF[arisu_smile] \\AA[F]';
    const source = '幸恵「っ！？」\u3000\u3000   ' + controls;
    const translated = 'Yukie "!?"\n' + controls;
    const cache = new Map([[source, translated]]);
    const message = { _texts: cache.get(source).split('\n') };
    const raw = message._texts.join('\n');
    // Native startMessage reads allText before the display conversion.
    const nativePortraitInput = raw.replace(/\\V\[101\]/gi, '0');
    expect(nativePortraitInput.match(/\\F\[(\w+)\]/)[1]).toBe('0satie_komariA');
    const display = new BaseWindow().convertEscapeCharacters(raw);
    expect(display).toBe('Yukie "!?"\n ');
    expect(message._texts.join('\n')).toBe(translated);
    expect(cache.get(source)).toBe(translated);
    expect(cache.size).toBe(1);
    expect(new BaseWindow().convertEscapeCharacters('Text\\C[2]red\\I[12]')).toBe(
        'Text\x1bC[2]red\x1bI[12]'
    );
    enabled = false;
    expect(new BaseWindow().convertEscapeCharacters(raw)).toContain('satie_komariA');
});

it('waits for the display converter before enabling the patch', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('Window_Base', undefined);
    expect(new LLStandingPictureTranslator().enablePluginTranslation()).toBe(false);
});
