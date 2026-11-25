import { it, expect, vi, afterEach } from 'vitest';
import { SourceTextCatalogTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
import { preserveNativeBitmapText } from '../cheat-engine/www/cheat/translate-engines/plugins/BitmapTextCompatibility.js';
import { UskMiraUiTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/UskMiraUiTranslator.js';
import { ExternMessageTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/ExternMessageTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('preserves native Bitmap identity and descriptor while localizing only display text', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'UskCoreOverWrite', status: true },
        { name: 'UskMiraTerms', status: true },
    ]);
    expect(preserveNativeBitmapText(window.$plugins)).toBe(true);
    expect(preserveNativeBitmapText([{ name: 'UskCoreOverWrite', status: false }])).toBe(false);
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    const draw = Bitmap.prototype.drawText;
    const descriptor = Object.getOwnPropertyDescriptor(Bitmap.prototype, 'drawText');
    class Base {
        convertEscapeCharacters(text) {
            return PluginManagerEx.convertEscapeCharactersEx(text);
        }
        constructor() {
            this.contents = new Bitmap();
        }
        drawText(text) {
            return this.contents.drawText(text);
        }
        drawTextEx(text) {
            return this.contents.drawText(text);
        }
    }
    class Message {
        add() {}
        faceName() {
            return '';
        }
    }
    class MessageWindow {
        startMessage() {}
    }
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    const terms = { status: '状態' };
    vi.stubGlobal('PluginManagerEx', {
        convertEscapeCharactersEx: (text) =>
            text
                .replace(/\\UTERMS\[(\w+)\]/g, (_, key) => terms[key])
                .replace(/\\UTX\[attack\]/g, '一行\n二行'),
    });
    vi.stubGlobal('CsvImportor', { parseFromCSV: () => [] });
    const nativeResourceExpansion = PluginManagerEx.convertEscapeCharactersEx;
    const runtime = {
        enabled: false,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map([['plugin_usk_mira_ui:状態', 'Status']]),
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    const translator = new UskMiraUiTranslator();
    translator.entries.set('状態', { text: '状態' });
    translator.entries.set('一行\n二行', { text: '一行\n二行' });
    translator.textResources = new Map([['attack', '一行\n二行']]);
    runtime.translationCache.set('plugin_usk_mira_ui:一行\n二行', 'First\nSecond');
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    expect(translator.enablePluginTranslation()).toBe(true);
    // Event UI also installs the shared hooks in this game.
    const sibling = new SourceTextCatalogTranslator();
    vi.spyOn(sibling, 'getRuntime').mockReturnValue(runtime);
    vi.spyOn(sibling, 'precomputeCounts').mockResolvedValue();
    sibling.enablePluginTranslation();
    expect(new Base().drawText('状態')).toBe('状態');
    expect(PluginManagerEx.convertEscapeCharactersEx(String.raw`\UTERMS[status]`)).toBe('状態');
    expect(new Base().convertEscapeCharacters(String.raw`\UTX[attack]`)).toBe('一行\n二行');
    runtime.enabled = true;
    expect(new Base().drawText('状態')).toBe('Status');
    expect(PluginManagerEx.convertEscapeCharactersEx(String.raw`\UTERMS[status]`)).toBe('状態');
    expect(new Base().convertEscapeCharacters(String.raw`\UTERMS[status]`)).toBe('Status');
    expect(new Base().convertEscapeCharacters(String.raw`\UTX[attack]`)).toBe('First\nSecond');
    expect(PluginManagerEx.convertEscapeCharactersEx).toBe(nativeResourceExpansion);
    expect(PluginManagerEx.convertEscapeCharactersEx(String.raw`\UTERMS[status]`)).toBe('状態');
    expect(Bitmap.prototype.drawText).toBe(draw);
    expect(Object.getOwnPropertyDescriptor(Bitmap.prototype, 'drawText')).toEqual(descriptor);
    expect(terms.status).toBe('状態');
    expect(runtime.trackCacheKeyUsage.mock.calls.every(([key]) => !key.endsWith(':Status'))).toBe(
        true
    );
});
it('accepts the native image-preload tuple without changing event dispatch, CSV keys or image commands', () => {
    vi.stubGlobal('window', globalThis);
    class Interpreter {
        command101() {
            return 'native-event';
        }
    }
    vi.stubGlobal('Game_Interpreter', Interpreter);
    const table = { guild_devil01: ['First page', 'Other language'] };
    vi.stubGlobal('$externMessage', { _map: table, ValueReferenceColumnIndex: 1 });
    const commands = [
        { code: 401, parameters: ['本当の台詞'] },
        { code: 101, parameters: ['face', 0, 0, 2, '案内人'] },
        { code: 401, parameters: ['次の台詞'] },
        { code: 355, parameters: ['nativeEvent();'] },
    ];
    const images = [{ code: 231, parameters: [1, 'guild'] }];
    const compiler = vi.fn(() => [structuredClone(commands), structuredClone(images)]);
    vi.stubGlobal('convertMessageCommand', compiler);
    const parse = vi.fn((text) => text);
    vi.stubGlobal('parseCmd', parse);
    vi.stubGlobal('convertScript', () => ({ immediate: true }));
    const runtime = {
        enabled: false,
        isTranslationEnabled() {
            return this.enabled;
        },
    };
    const translator = new ExternMessageTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(window.convertMessageCommand({ parameters: ['guild_devil01'] })).toEqual([
        commands,
        images,
    ]);
    expect(new Interpreter().command101()).toBe('native-event');
    const entries = translator.buildScanEntries();
    expect(entries.map((x) => [x.cacheType, x.text])).toContainEqual(['message', '本当の台詞']);
    expect(entries.map((x) => [x.cacheType, x.text])).toContainEqual([
        'message_portrait',
        '次の台詞',
    ]);
    expect(entries.some((x) => x.text === 'guild_devil01')).toBe(false);
    expect(table).toEqual({ guild_devil01: ['First page', 'Other language'] });
    expect($externMessage.ValueReferenceColumnIndex).toBe(1);
    expect(window.parseCmd).not.toBe(parse); // Adapter wrapper is restored, not the scan-time override.
});
