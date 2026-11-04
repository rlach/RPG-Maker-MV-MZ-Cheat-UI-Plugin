import { afterEach, expect, it, vi } from 'vitest';
import { ChimakiLangTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ChimakiLangTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function setup() {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        {
            name: 'Chimaki_Lang',
            status: true,
            parameters: { defaultLang: 'tw', loadfileName: "['UI']" },
        },
    ]);
    vi.stubGlobal('$dataMapInfos', []);
    vi.stubGlobal('$dataCommonEvents', []);
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => {
            expect(path).toBe('csv/UI.csv');
            return {
                ok: true,
                text: async () =>
                    '\ufeffid,who,tw,cn,en\r\nNAME,actor,アリス,爱丽丝,Alice official\r\nMENU,ui,装備,装备,Equip official\r\nDIALOG,line,"こんにちは、友達！\n元気？",other,official\r\nNESTED,line,\\T[NAME],other,official\r\n',
            };
        })
    );
    const translator = new ChimakiLangTranslator();
    await translator.precomputeCounts();
    const runtime = {
        isTranslationEnabled: () => true,
        engine: { addPluginTags: vi.fn() },
        getCacheKey: (text, type) => `${type}:${text}`,
        getCanonicalSystemCommandName: (text) => text,
        getMessageCacheLookupKeys: (text) => [`message:${text}`],
        getMessageCacheKey: (text) => `message:${translator.sourceText(text)}`,
        translationCache: new Map([
            ['actor_name:アリス', 'Alice'],
            ['plugin_chimaki_lang:装備', 'Equipment'],
            ['plugin_chimaki_lang:こんにちは、友達！\n元気？', 'Hello, friend!\nHow are you?'],
        ]),
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
        setCacheValue(key, value) {
            this.translationCache.set(key, value);
        },
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return { translator, runtime };
}

it('catalogs the default CSV column with quoted commas/newlines and expands names before translation', async () => {
    const { translator, runtime } = await setup();
    expect(translator.entries.has('こんにちは、友達！\n元気？')).toBe(true);
    expect(translator.entries.has('Alice official')).toBe(false);
    expect(translator.entries.has('\\T[NAME]')).toBe(false);
    expect(translator.sourceText('\\T[NESTED]')).toBe('アリス');
    expect(translator.sourceText('\\\\T[NAME]')).toBe('アリス');
    expect(translator.sourceText('\x1bT[NAME]')).toBe('アリス');
    expect(
        translator.normalizeTranslationEntry({ type: 'actor_name', value: '\\T[NAME]' }).value
    ).toBe('アリス');
    expect(translator.resolveText('\\T[NAME]', runtime)).toBe('Alice');
    expect(translator.resolveText('\\T[UNKNOWN]', runtime)).toBe('\\T[UNKNOWN]');
});

it('translates animated command labels and keeps canonical messages for the standard pipeline', async () => {
    const { translator, runtime } = await setup();
    class Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
        convertEscapeCharacters(text) {
            return text.replace(/\\N\[1\]/g, '\\T[NAME]').replaceAll('\\', String.fromCharCode(27));
        }
    }
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class Message {
        constructor() {
            this._texts = [];
        }
        faceName() {
            return '';
        }
        processLangChange() {
            return 'official translation';
        }
        add(text) {
            this._texts.push(this.processLangChange(text));
        }
        setSpeakerName(text) {
            this.speaker = text;
        }
    }
    class MessageWindow {
        startMessage() {
            return globalThis.$gameMessage._texts.join('\n');
        }
    }
    class Command {
        commandName() {
            return '\\T[MENU]';
        }
    }
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    vi.stubGlobal('Window_Command', Command);
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(new Command().commandName()).toBe('Equipment');
    expect(new Bitmap().drawText('\\T[NAME]')).toBe('Alice');
    expect(new Base().convertEscapeCharacters('\\C[2]\\N[1]')).toBe('\x1bC[2]Alice');
    const message = new Message();
    vi.stubGlobal('$gameMessage', message);
    message.setSpeakerName('\\T[NAME]');
    expect(message.speaker).toBe('Alice');
    message.add('\\T[DIALOG]');
    expect(message._texts).toEqual(['こんにちは、友達！\n元気？']);
    expect(new MessageWindow().startMessage()).toBe('Hello, friend!\nHow are you?');
    expect(message._texts).toEqual(['こんにちは、友達！\n元気？']);
    expect(translator.resolveMessageCacheSourceText({ text: 'Equipment' })).toBe('装備');
    expect(runtime.getMessageCacheLookupKeys('こんにちは、友達！\n元気？')).toContain(
        'plugin_chimaki_lang:こんにちは、友達！\n元気？'
    );
    runtime.isTranslationEnabled = () => false;
    expect(new Command().commandName()).toBe('\\T[MENU]');
    expect(message.processLangChange('\\T[DIALOG]')).toBe('official translation');
});
