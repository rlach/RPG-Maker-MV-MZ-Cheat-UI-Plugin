import { afterEach, expect, it, vi } from 'vitest';
import { KekeChangeLayoutLightTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/KekeChangeLayoutLightTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('catalogs all position values and translates presentation without mutating config', async () => {
    const symbols = ['menuCmdPos', 'battleCmdPos', 'menuHelpPos', 'touchUIPos', 'bgmVolume'];
    const values = ['右', '左', '下', '上', '100%'];
    class Options {
        commandSymbol(index) { return symbols[index]; }
        statusText(index) { return values[index]; }
    }
    vi.stubGlobal('window', { Window_Options: Options });
    const translator = new KekeChangeLayoutLightTranslator();
    await translator.buildCatalog();
    expect([...translator.entries.keys()].sort()).toEqual(['左', '右', '上', '下'].sort());
    let enabled = true;
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: text => text,
        hasUsableCacheValue: key => runtime.translationCache.has(key),
        translationCache: new Map([['右', 'Right'], ['左', 'Left'], ['下', 'Bottom'], ['上', 'Top']]),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const options = new Options();
    expect(symbols.map((_, i) => options.statusText(i))).toEqual(['Right', 'Left', 'Bottom', 'Top', '100%']);
    expect(values).toEqual(['右', '左', '下', '上', '100%']);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(4);
    enabled = false;
    expect(options.statusText(0)).toBe('右');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(4);
    runtime.translationCache.clear();
    enabled = true;
    expect(options.statusText(0)).toBe('右');
});
