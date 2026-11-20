import { it, expect, vi, afterEach } from 'vitest';
import { LunatlazurActorNameWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LunatlazurActorNameWindowTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function setup(parseDuringStart = false) {
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
            this.setText('');
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
            const converted = super.convertEscapeCharacters(text);
            return parseDuringStart ? converted : this._nameWindow.processActorName(converted);
        }
        startMessage(text) {
            this._nameWindow.active = false;
            this._textState = { text: this.convertEscapeCharacters(text) };
            if (parseDuringStart)
                this._textState.text = this._nameWindow.processActorName(this._textState.text);
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

it('keeps the name visible when v1.1.0 parses names after conversion in startMessage', () => {
    const { Message, translator, runtime } = setup(true);
    runtime.hasUsableCacheValue = (key) => runtime.translationCache.has(key);
    runtime.translationCache.set('actor_name:ボク', 'Me');
    translator.enablePluginTranslation();
    const message = new Message();
    message.createSubWindows();
    const process = message._nameWindow.processActorName;
    for (let redraw = 0; redraw < 3; redraw++) {
        message.startMessage('\\N<ボク>Hello');
        expect(message._nameWindow.name).toBe('Me');
        expect(message._nameWindow.active).toBe(true);
        expect(message._textState.text).toBe('Hello');
        expect(message._nameWindow.processActorName).toBe(process);
    }
    expect(runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual(
        Array(3).fill('actor_name:ボク')
    );
    message.startMessage('Hello without speaker');
    expect(message._nameWindow.name).toBe('');
    expect(message._nameWindow.active).toBe(false);
    runtime.enabled = false;
    message.startMessage('\\N<ボク>Hello');
    expect(message._nameWindow.name).toBe('ボク');
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
it.each([false, true])('logging preserves the visible Lunatlazur name (late parsing: %s)', async (lateParsing) => {
    const { recordDisplayedMessage } = await import('../../../../../../../cheat-engine/www/cheat/js/DisplayedMessageText.js');
    const { Message, translator, runtime } = setup(lateParsing);
    runtime.hasUsableCacheValue = key => runtime.translationCache.has(key);
    runtime.translationCache.set('actor_name:ボク', 'Me');
    translator.enablePluginTranslation();
    const messageWindow = new Message(); messageWindow.createSubWindows();
    messageWindow.startMessage('\\N<ボク>Hello');
    const nameWindow = messageWindow._nameWindow;
    const setName = vi.spyOn(nameWindow, 'setText');
    const message = { _speakerName: '', allText: () => '\\N<ボク>Hello', choices: () => ['Yes', 'No'] };
    const store = { addEntry: vi.fn(() => 1), updateEntry: vi.fn(() => true) };
    recordDisplayedMessage(message, messageWindow, null, store);
    recordDisplayedMessage(message, messageWindow, { commandName: i => ['Yes', 'No'][i] }, store);
    expect(nameWindow.name).toBe('Me');
    expect(nameWindow.active).toBe(true);
    expect(setName).not.toHaveBeenCalled();
    expect(store.addEntry).toHaveBeenCalledWith('Hello', expect.objectContaining({ speakerName: 'Me' }));
    expect(store.updateEntry).toHaveBeenCalledWith(1, expect.objectContaining({ speakerName: 'Me', choices: ['Yes', 'No'] }));
    messageWindow.startMessage('Nobody speaking');
    const next = { _speakerName: '', allText: () => 'Nobody speaking' };
    recordDisplayedMessage(next, messageWindow, null, store);
    expect(store.addEntry).toHaveBeenLastCalledWith('Nobody speaking', expect.objectContaining({ speakerName: null }));
});
