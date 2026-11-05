import { it, expect, vi, afterEach } from 'vitest';
import { InfoWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/InfoWindowTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('scans labels before observation and translates only the private menu window, preserving numbers', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('SceneManager', {});
    vi.stubGlobal('$plugins', [{ name: 'InfoWindow', status: true, parameters: {} }]);
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            text: async () => `
        (function () {
            function Window_Info() {}
            Window_Info.prototype.refresh = function () {
                this.drawText("性欲", 1, 1);
                this.drawText($gameVariables.value(35), 115, 0, 80, 'right');
                this.drawText("淫乱度", 0, this.lineHeight() + 1);
                /* this.drawText("尿意", 0, 80); */
            };
        })();`,
        }))
    );
    class LocalWindow {
        drawText(text) {
            return text;
        }
    }
    class Menu {
        createInfoWindow() {
            this._InfoWindow = new LocalWindow();
        }
    }
    vi.stubGlobal('Scene_Menu', Menu);
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    const translator = new InfoWindowTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();
    expect(translator.collectUntranslated({ runtime }).map((item) => item.value)).toEqual([
        '性欲',
        '淫乱度',
    ]);
    runtime.translationCache.set('plugin_info_window:性欲', 'Lust');
    runtime.translationCache.set('plugin_info_window:淫乱度', 'Lewdness');
    const scene = new Menu();
    scene.createInfoWindow();
    expect(scene._InfoWindow.drawText('性欲')).toBe('Lust');
    expect(scene._InfoWindow.drawText('淫乱度')).toBe('Lewdness');
    expect(scene._InfoWindow.drawText(35)).toBe(35);
    expect(new LocalWindow().drawText('性欲')).toBe('性欲');
    expect(translator.getCachedCountsSync({ runtime })).toEqual({
        total: 2,
        left: 0,
        totalStrings: 2,
        leftStrings: 0,
    });
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_info_window:性欲',
        expect.anything()
    );
    runtime.enabled = false;
    runtime.trackCacheKeyUsage.mockClear();
    expect(scene._InfoWindow.drawText('性欲')).toBe('性欲');
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
});

it('retries while the plugin menu method is unavailable', () => {
    vi.stubGlobal('window', { Scene_Menu: class {} });
    expect(new InfoWindowTranslator().enablePluginTranslation()).toBe(false);
});

it('hooks the map HUD variant created in Scene_Map.start', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('Scene_Menu', class {});
    class MapScene {
        start() {
            this._InfoWindow = { drawText: (text) => text };
        }
    }
    vi.stubGlobal('Scene_Map', MapScene);
    vi.stubGlobal('SceneManager', {});
    const translator = new InfoWindowTranslator();
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    vi.spyOn(translator, 'resolveText').mockImplementation((text) =>
        text === '日目' ? 'Day' : text
    );
    vi.spyOn(translator, 'getRuntime').mockReturnValue({});
    expect(translator.enablePluginTranslation()).toBe(true);
    const scene = new MapScene();
    scene.start();
    expect(scene._InfoWindow.drawText('日目')).toBe('Day');
});
