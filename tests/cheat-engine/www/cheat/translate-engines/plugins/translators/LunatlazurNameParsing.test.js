import { it, expect, vi, afterEach } from 'vitest';
import { LunatlazurActorNameWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LunatlazurActorNameWindowTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function setup() {
    vi.stubGlobal('window', globalThis);
    class Base {
        // PANDA_KeywordColor runs before standard escape conversion.
        convertEscapeCharacters(text) {
            return text
                .replace(/<([S])(.+?)>/gi, (_tag, _color, value) => '\\C[2]' + value + '\\C[0]')
                .replace(/\\/g, '\x1b')
                .replace(/\x1bV\[1\]/gi, 'Shizuku');
        }
    }
    class NameWindow {
        setText(text) {
            this.name = text;
        }
        processActorName(text) {
            return text.replace(/\x1bN\<(.*?)\>/gi, (_tag, name) => {
                this.setText(name);
                this.active = true;
                return '';
            });
        }
    }
    class Message extends Base {
        createSubWindows() {
            this._nameWindow = new NameWindow();
        }
        convertEscapeCharacters(text) {
            return this._nameWindow.processActorName(super.convertEscapeCharacters(text));
        }
    }
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Window_Message', Message);
    vi.stubGlobal('SceneManager', {});
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue: () => false,
        trackCacheKeyUsage: vi.fn(),
    };
    const translator = new LunatlazurActorNameWindowTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    vi.spyOn(translator, 'registerPluginCustomTags').mockImplementation(() => {});
    return { Message, translator, runtime };
}

it('reproduces the S-name conflict and fixes it while keeping body color tags working', () => {
    const { Message, translator, runtime } = setup();
    const broken = new Message();
    broken.createSubWindows();
    expect(broken.convertEscapeCharacters('\\N<Shizuku>(He clearly dislikes me...)')).toContain(
        'hizuku'
    );
    expect(broken._nameWindow.active).toBeUndefined();
    expect(translator.enablePluginTranslation()).toBe(true);
    for (const name of ['Shizuku', 'shizuku', 'S', 'Ahizuku', '雫']) {
        const message = new Message();
        message.createSubWindows();
        expect(
            message.convertEscapeCharacters(`\\N<${name}>(He clearly dislikes me...) <Scolored>`)
        ).toBe('(He clearly dislikes me...) \x1bC[2]colored\x1bC[0]');
        expect(message._nameWindow.name).toBe(name);
        expect(message._nameWindow.active).toBe(true);
    }
    expect(runtime.trackCacheKeyUsage.mock.calls.some(([key]) => key.includes('LUNATL_NAME'))).toBe(
        false
    );
});

it('keeps name escape expansion, ESC inputs, multiple tags and original OFF behavior', () => {
    const { Message, translator, runtime } = setup();
    translator.enablePluginTranslation();
    const message = new Message();
    message.createSubWindows();
    expect(message.convertEscapeCharacters('\\N<\\V[1]>Hello')).toBe('Hello');
    expect(message._nameWindow.name).toBe('Shizuku');
    expect(message.convertEscapeCharacters('\x1bN<Sara>Hello\\N<Sophie>World')).toBe('HelloWorld');
    expect(message._nameWindow.name).toBe('Sophie');
    runtime.enabled = false;
    expect(message.convertEscapeCharacters('\\N<Shizuku>Hello')).toContain('hizuku');
});
