import { it, expect, vi, afterEach } from 'vitest';
import { LLTrackNameWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LLTrackNameWindowTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('scans BGM display names, translates the private notification and leaves audio IDs intact', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('SceneManager', {});
    const parameters = {
        trackLists: JSON.stringify([
            JSON.stringify({ trackFile: '03-Twilight', trackName: 'トワイライト' }),
        ]),
        optionCommandName: '曲名表示',
    };
    vi.stubGlobal('$plugins', [{ name: 'LL_TrackNameWindow', status: true, parameters }]);
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '' }));
    class TrackWindow {
        drawText(text) {
            return text;
        }
        refresh() {
            this.text = this.drawText('トワイライト');
        }
    }
    class MapScene {
        createTrackNameWindow() {
            this._trackNameWindow = new TrackWindow();
            this._trackNameWindow.refresh();
        }
    }
    class Options {
        drawText(text) {
            return text;
        }
    }
    vi.stubGlobal('Scene_Map', MapScene);
    vi.stubGlobal('Window_Options', Options);
    const translator = new LLTrackNameWindowTranslator();
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
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();
    expect(translator.collectUntranslated({ runtime }).map((item) => item.value)).toEqual([
        'トワイライト',
        '曲名表示',
    ]);
    runtime.translationCache.set('plugin_ll_track_name_window:トワイライト', 'Twilight');
    runtime.translationCache.set('plugin_ll_track_name_window:曲名表示', 'Show track names');
    const scene = new MapScene();
    scene.createTrackNameWindow();
    expect(scene._trackNameWindow.text).toBe('Twilight');
    expect(new Options().drawText('曲名表示')).toBe('Show track names');
    expect(parameters.trackLists).toContain('03-Twilight');
    expect(new TrackWindow().drawText('トワイライト')).toBe('トワイライト');
    runtime.enabled = false;
    scene._trackNameWindow.refresh();
    expect(scene._trackNameWindow.text).toBe('トワイライト');
});
