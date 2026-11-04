import { afterEach, expect, it, vi } from 'vitest';
import { BBCustomSaveWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/BBCustomSaveWindowTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('translates saved map names using the map cache without changing saves or unrelated fields', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'BB_CustomSaveWindow', status: true, parameters: { Item1title: '現在地' } },
    ]);
    class SaveWindow {
        drawText(text) {
            return text;
        }
        drawContents(info) {
            return [
                this.drawText(info.mapname),
                this.drawText(info.playtime),
                this.drawText('現在地'),
            ];
        }
    }
    vi.stubGlobal('Window_SavefileList', SaveWindow);
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([
            ['map_name:ひわい町', 'Town'],
            ['plugin_bb_custom_save_window:現在地', 'Current Location'],
        ]),
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    const translator = new BBCustomSaveWindowTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const saved = Object.freeze({ mapname: 'ひわい町', playtime: '00:04:24' });
    const window = new SaveWindow();
    expect(window.drawContents(saved)).toEqual(['Town', '00:04:24', 'Current Location']);
    expect(saved.mapname).toBe('ひわい町');
    expect(window.drawText(saved.mapname)).toBe('ひわい町');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith('map_name:ひわい町', expect.anything());
    runtime.enabled = false;
    expect(window.drawContents(saved)).toEqual(['ひわい町', '00:04:24', '現在地']);
});
