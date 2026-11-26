import { afterEach, expect, it, vi } from 'vitest';
import { MoviePictureTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MoviePictureTranslator.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('accepts the native MZ 2.x video API without patching its working playback', () => {
    const loadVideo = vi.fn(() => ({ nativeVideo: true }));
    const manager = { loadVideo, getVideoFilePath: () => 'movies/test.webm', getVideoFileExt: () => '.webm' };
    vi.stubGlobal('window', { Utils: { RPGMAKER_NAME: 'MZ' }, ImageManager: manager });
    expect(new MoviePictureTranslator().enablePluginTranslation()).toBe(true);
    expect(manager.getVideoClass).toBeUndefined();
    expect(manager.loadVideo).toBe(loadVideo);
    expect(manager.loadVideo('test')).toEqual({ nativeVideo: true });
    delete manager.getVideoFileExt;
    expect(new MoviePictureTranslator().enablePluginTranslation()).toBe(false);
});
it('only detects the enabled MoviePicture plugin', () => {
    vi.stubGlobal('window', { $plugins: [{ name: 'MoviePicture', status: false }] });
    expect(new MoviePictureTranslator().detectPlugin()).toBe(false);
    window.$plugins = [{ name: 'OtherPlugin', status: true }];
    expect(new MoviePictureTranslator().detectPlugin()).toBe(false);
    window.$plugins = [{ name: 'MoviePicture', status: true }];
    expect(new MoviePictureTranslator().detectPlugin()).toBe(true);
});
it('retries before the native movie factory exists without partially patching', () => {
    vi.stubGlobal('window', { ImageManager: { loadVideo() {} } });
    expect(new MoviePictureTranslator().enablePluginTranslation()).toBe(false);
    expect(window.ImageManager.getVideoClass).toBeUndefined();
});
it('uses the native canvas class for ordinary and alpha movies independently of translation', () => {
    class CanvasVideo {}
    const calls = [];
    const loadVideo = vi.fn(function(name, alpha) { return { name, bitmapClass: this.getVideoClass(alpha), loop: true }; });
    const manager = { getVideoClass(alpha, marker) { calls.push({ receiver: this, alpha, marker }); return alpha ? CanvasVideo : null; }, loadVideo };
    vi.stubGlobal('window', { ImageManager: manager });
    const t = new MoviePictureTranslator();
    const runtime = vi.spyOn(t, 'getRuntime').mockImplementation(() => { throw new Error('Text translation must not be required'); });
    expect(t.enablePluginTranslation()).toBe(true);
    expect(manager.getVideoClass(false, 'native argument')).toBe(CanvasVideo);
    expect(calls[0]).toEqual({ receiver: manager, alpha: true, marker: 'native argument' });
    for (const alpha of [false, true]) expect(manager.loadVideo('movie', alpha)).toEqual({ name: 'movie', bitmapClass: CanvasVideo, loop: true });
    expect(manager.loadVideo).toBe(loadVideo);
    expect(runtime).not.toHaveBeenCalled();
    expect(t.collectUntranslated()).toEqual([]);
});
