import { afterEach, expect, it, vi } from 'vitest';
import { normalizeLocalImagePath, installImagePathCompatibility } from '../cheat-engine/www/cheat/js/ImagePathCompatibility.js';
vi.mock('../cheat-engine/www/cheat/js/RootWindowState.js', () => ({ getRootWindow: () => globalThis.window }));
afterEach(() => vi.unstubAllGlobals());

it('restores nested separators without decoding filename characters or literal percent escapes', () => {
    const name = 'title/日本語 #?%2F ボタン';
    const encoded = 'img/pictures/' + encodeURIComponent(name) + '.png';
    expect(normalizeLocalImagePath(encoded)).toBe('img/pictures/title/' + encodeURIComponent('日本語 #?%2F ボタン') + '.png');
    expect(normalizeLocalImagePath('./img/pictures/title%2fsub%5Cbutton.png')).toBe('./img/pictures/title/sub/button.png');
    for (const url of ['img/pictures/button.png', 'img/pictures/percent%252F.png', 'https://host/img/title%2Fbutton.png', 'data:image/png;base64,abc', 'blob:abc', undefined])
        expect(normalizeLocalImagePath(url)).toBe(url);
});
it('keeps MV native decryption and loading arguments, and repairs deferred requests independently of translation', () => {
    const requests = [];
    class Bitmap {
        static load(url, hue) { const result = new this(); result._requestImage(url, hue); return result; }
        static request(url) { return { url }; }
        _requestImage(url, hue) { requests.push({ url, encrypted: url.replace(/\.png$/, '.rpgmvp'), hue, bitmap: this }); }
    }
    vi.stubGlobal('window', { Bitmap });
    expect(installImagePathCompatibility()).toBe(true);
    const patched = Bitmap.load;
    expect(installImagePathCompatibility()).toBe(true);
    expect(Bitmap.load).toBe(patched);
    const result = Bitmap.load('img/pictures/title%2Fbutton_new.png', 90);
    expect(requests[0]).toEqual({ url: 'img/pictures/title/button_new.png', encrypted: 'img/pictures/title/button_new.rpgmvp', hue: 90, bitmap: result });
    const deferred = Bitmap.request('img/pictures/title%2Fbutton_new.png');
    expect(deferred.url).toBe('img/pictures/title/button_new.png');
    result._requestImage('img/pictures/title%2Fbutton_new.png', 0);
    expect(requests[1].url).toBe('img/pictures/title/button_new.png');
});
it('supports MZ without MV request methods and preserves the native receiver and result', () => {
    const result = {};
    const load = vi.fn(function(url) { expect(this).toBe(window.Bitmap); expect(url).toBe('img/pictures/title/button.png'); return result; });
    vi.stubGlobal('window', { Bitmap: { load } });
    expect(installImagePathCompatibility()).toBe(true);
    expect(window.Bitmap.load('img/pictures/title%2Fbutton.png')).toBe(result);
});
it('does not mark the hook installed before Bitmap exists', () => {
    vi.stubGlobal('window', {});
    expect(installImagePathCompatibility()).toBe(false);
    window.Bitmap = { load: url => url };
    expect(installImagePathCompatibility()).toBe(true);
    expect(window.Bitmap.load('img/pictures/a%2Fb.png')).toBe('img/pictures/a/b.png');
});
