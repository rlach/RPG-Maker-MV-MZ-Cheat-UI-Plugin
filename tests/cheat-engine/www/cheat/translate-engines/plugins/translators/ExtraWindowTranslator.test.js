import { afterEach, expect, it, vi } from 'vitest';
import { ExtraWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ExtraWindowTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('uses original templates for catalog, live redraws and seen tracking', async () => {
    const source = '  Purity: \\c[14]\\v[41]\\c[0]/255';
    const translated = '  Czystosc: \\c[14]\\v[41]\\c[0]/255';
    let value = 246;
    let enabled = true;
    class ExtraWindow {
        constructor() {
            this._data = { Text: source };
        }
        drawAllText() {
            return this._data.Text.replace('\\v[41]', String(value));
        }
    }
    const plugin = {
        name: 'folder/ExtraWindow',
        status: true,
        parameters: {
            WindowList: JSON.stringify([
                JSON.stringify({ Text: source }),
                JSON.stringify({ Text: source }),
            ]),
        },
    };
    vi.stubGlobal('window', { $plugins: [plugin], Window_SceneExtra: ExtraWindow });
    vi.stubGlobal('Window_SceneExtra', ExtraWindow);
    const translator = new ExtraWindowTranslator();
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map(),
        hasUsableCacheValue: (key) => runtime.translationCache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    await translator.precomputeCounts();
    const [item] = translator.collectUntranslated({ runtime });
    expect(item.value).toBe(source);
    expect(translator.getCachedCountsSync({ runtime }).totalStrings).toBe(1);
    expect(translator.enablePluginTranslation()).toBe(true);
    const display = new ExtraWindow();
    expect(display.drawAllText()).toContain('Purity:');
    runtime.translationCache.set(item.cacheKey, translated);
    expect(display.drawAllText()).toBe(translated.replace('\\v[41]', '246'));
    value = 200;
    expect(display.drawAllText()).toBe(translated.replace('\\v[41]', '200'));
    expect(display._data.Text).toBe(source);
    expect(runtime.trackCacheKeyUsage.mock.calls.every(([key]) => key === item.cacheKey)).toBe(
        true
    );
    expect(translator.getCachedCountsSync({ runtime }).leftStrings).toBe(0);
    runtime.trackCacheKeyUsage.mockClear();
    enabled = false;
    expect(display.drawAllText()).toBe(source.replace('\\v[41]', '200'));
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
});

it('retries until the plugin window is available and restores templates on failure', () => {
    vi.stubGlobal('window', {});
    const translator = new ExtraWindowTranslator();
    expect(translator.enablePluginTranslation()).toBe(false);
    class ExtraWindow {
        drawAllText() {
            throw new Error('draw failed');
        }
    }
    window.Window_SceneExtra = ExtraWindow;
    vi.stubGlobal('Window_SceneExtra', ExtraWindow);
    vi.spyOn(translator, 'getRuntime').mockReturnValue({ isTranslationEnabled: () => true });
    vi.spyOn(translator, 'resolveRuntimeTranslation').mockReturnValue('translated');
    expect(translator.enablePluginTranslation()).toBe(true);
    const display = new ExtraWindow();
    display._data = { Text: 'original' };
    expect(() => display.drawAllText()).toThrow('draw failed');
    expect(display._data.Text).toBe('original');
});
