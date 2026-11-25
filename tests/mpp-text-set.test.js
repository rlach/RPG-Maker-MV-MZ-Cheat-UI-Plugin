import { it, expect, vi, afterEach } from 'vitest';
import { MppMessageExTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MppMessageExTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('collects literal Text Set captions without technical-only entries or parameter mutation', async () => {
    vi.stubGlobal('window', globalThis);
    const values = [String.raw`\\C[0]`, String.raw`\\i[21]\\C[10]強靭\\C[0]`];
    const plugin = {
        name: 'MPP_MessageEX',
        status: true,
        parameters: { 'Text Set': JSON.stringify(values) },
    };
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => 'var $plugins=' + JSON.stringify([plugin]) + ';',
    }));
    const t = new MppMessageExTranslator();
    await t.precomputeCounts();
    expect(t.entries.has(String.raw`\i[21]\C[10]強靭\C[0]`)).toBe(true);
    expect(t.entries.size).toBe(1);
    expect(values[1]).toBe(String.raw`\\i[21]\\C[10]強靭\\C[0]`);
});

it('translates SET captions through captured message conversion and preserves the native source table', () => {
    vi.stubGlobal('window', globalThis);
    const source = String.raw`\C[10]強靭\C[0]`;
    const values = [source];
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
        convertEscapeCharacters(text) {
            return text
                .replace(/\\/g, '\x1b')
                .replace(/\x1bSET\[1\]/g, () => this.convertEscapeCharacters(values[0]));
        }
    }
    const captured = Base.prototype.convertEscapeCharacters;
    class MessageWindow extends Base {
        startMessage() {}
        convertEscapeCharacters(text) {
            return captured.call(this, text);
        }
    }
    class Message {
        add() {}
        faceName() {
            return '';
        }
    }
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Window_Message', MessageWindow);
    vi.stubGlobal('Game_Message', Message);
    const t = new MppMessageExTranslator();
    t.entries.set(source, { text: source });
    vi.spyOn(t, 'precomputeCounts').mockResolvedValue();
    const rt = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags() {} },
        getCacheKey: (s, k) => k + ':' + s,
        translationCache: new Map([
            ['plugin_mpp_message_ex:' + source, String.raw`\C[10]Toughness\C[0]`],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(rt);
    expect(t.enablePluginTranslation()).toBe(true);
    for (const view of [new Base(), new MessageWindow()]) {
        expect(view.convertEscapeCharacters(String.raw`\SET[1]`)).toBe(
            '\x1bC[10]Toughness\x1bC[0]'
        );
        expect(view.convertEscapeCharacters(String.raw`\SET[1]`)).toBe(
            '\x1bC[10]Toughness\x1bC[0]'
        );
    }
    expect(values).toEqual([source]);
    expect(rt.trackCacheKeyUsage.mock.calls.every(([key]) => !key.includes('Toughness'))).toBe(
        true
    );
    rt.enabled = false;
    expect(new MessageWindow().convertEscapeCharacters(String.raw`\SET[1]`)).toContain('強靭');
});
