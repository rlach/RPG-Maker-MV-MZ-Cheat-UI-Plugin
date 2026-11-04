import { afterEach, expect, it, vi } from 'vitest';
import { SonStatusCustomTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SonStatusCustomTranslator.js';
import { extractJavaScriptTextCatalog } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('extracts and translates menu dates while leaving variable translation to the existing system', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        {
            name: 'LL_MenuScreenCustom',
            status: true,
            parameters: {
                rightBlockValue:
                    '$gameVariables.value(61) + "日目(" + $gameVariables.value(525) + ")"',
            },
        },
    ]);
    class Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
    }
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class Message {
        add() {}
    }
    class MessageWindow {
        startMessage() {}
    }
    const originalLabel = { text: '\\V[3061] ♥\\V[3121]', size: 16 };
    class Event {
        getEventLabel() {
            return originalLabel;
        }
    }
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    vi.stubGlobal('Game_Event', Event);
    vi.stubGlobal('$gameVariables', { value: (id) => (id === 3061 ? '★ワーム' : 1) });
    const translator = new SonStatusCustomTranslator();
    translator.extractCatalog = extractJavaScriptTextCatalog;
    await translator.collectAdditionalTexts();
    const date = [...translator.entries.values()].find((entry) => entry.parts);
    expect(date.parts).toEqual(['', '日目(', ')']);
    translator.templates = [{ ...date, pattern: /^(.*?)日目\((.*?)\)$/ }];
    expect(translator.shouldScanEventData()).toBe(false);
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: {},
        getCacheKey: (text) => text,
        translationCache: new Map([
            ['★ワーム', '★Worm'],
            [date.text, 'Day \\COT[0] (\\COT[1])'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    translator.tagEngine = runtime.engine;
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(new Base().drawTextEx('1日目(AM)')).toBe('Day 1 (AM)');
    expect(new Event().getEventLabel()).toBe(originalLabel);
    expect(originalLabel.text).toBe('\\V[3061] ♥\\V[3121]');
    expect(window.$gameVariables.value(3061)).toBe('★ワーム');
    runtime.enabled = false;
    expect(new Base().drawTextEx('1日目(AM)')).toBe('1日目(AM)');
    expect(new Event().getEventLabel()).toBe(originalLabel);
});
