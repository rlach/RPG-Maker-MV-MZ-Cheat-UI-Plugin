import { it, expect, vi } from 'vitest';
import { normalizeResourceUrl, installResourceUnicodeNormalization } from '../../../../../cheat-engine/www/cheat/js/ResourceUnicodeNormalization.js';

it('normalizes raw and escaped decomposed Japanese resource paths', () => {
    const raw = 'img/faces/つむき\u3099　制服.png';
    const expected = 'img/faces/つむぎ　制服.png';
    expect(decodeURI(normalizeResourceUrl(raw))).toBe(expected);
    expect(decodeURI(normalizeResourceUrl(encodeURI(raw)))).toBe(expected);
    expect(normalizeResourceUrl('img/pictures/foo%20bar.rpgmvp')).toBe('img/pictures/foo%20bar.rpgmvp');
    expect(normalizeResourceUrl(undefined)).toBeUndefined();
});

it('wraps image and audio loaders once and respects the toggle immediately', () => {
    const load = vi.fn();
    const initialize = vi.fn();
    const root = { Bitmap: { load }, WebAudio: { prototype: { initialize } } };
    let enabled = true;
    installResourceUnicodeNormalization(root, () => enabled);
    const wrapped = root.Bitmap.load;
    installResourceUnicodeNormalization(root, () => enabled);
    expect(root.Bitmap.load).toBe(wrapped);
    const path = 'img/faces/か\u3099.rpgmvp';
    root.Bitmap.load(path, 'extra');
    expect(decodeURI(load.mock.calls[0][0])).toBe('img/faces/が.rpgmvp');
    expect(load.mock.calls[0][1]).toBe('extra');
    root.WebAudio.prototype.initialize(path);
    expect(decodeURI(initialize.mock.calls[0][0])).toBe('img/faces/が.rpgmvp');
    enabled = false;
    root.Bitmap.load(path);
    expect(load.mock.calls[1][0]).toBe(path);
});
