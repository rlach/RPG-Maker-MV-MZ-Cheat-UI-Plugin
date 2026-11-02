import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import {
    createEncryptedImageLoader,
    findTranslatedImagePath,
} from '../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslatedImageResource.js';

afterEach(() => vi.unstubAllGlobals());

describe('translated encrypted images', () => {
    it('prefers PNG, falls back to RPGMVP, and leaves missing files alone', () => {
        const directory = path.resolve('cache/img/en/titles1');
        const png = path.join(directory, 'foo.png');
        const encrypted = path.join(directory, 'foo.rpgmvp');
        const files = new Set([png, encrypted]);
        const fs = { existsSync: (file) => files.has(file) };
        expect(findTranslatedImagePath(fs, path, directory, 'foo')).toBe(png);
        files.delete(png);
        expect(findTranslatedImagePath(fs, path, directory, 'foo')).toBe(encrypted);
        files.clear();
        expect(findTranslatedImagePath(fs, path, directory, 'foo')).toBeNull();
    });

    it.each(['MV', 'MZ'])(
        'decrypts with %s and retains bitmap cache and smoothing support',
        (engine) => {
            // A pooled Buffer must be sliced to the actual file, excluding unrelated bytes.
            const bytes = Buffer.from([9, 10, 11, 12]).subarray(1, 3);
            const readFileSync = vi.fn(() => bytes);
            vi.stubGlobal('require', (module) => (module === 'fs' ? { readFileSync } : { Buffer }));
            const decryptArrayBuffer = vi.fn((source) => {
                expect([...new Uint8Array(source)]).toEqual([10, 11]);
                return new Uint8Array([137, 80, 78, 71]).buffer;
            });
            vi.stubGlobal('Decrypter', engine === 'MV' ? { decryptArrayBuffer } : undefined);
            vi.stubGlobal('Utils', engine === 'MZ' ? { decryptArrayBuffer } : undefined);
            const load = vi.fn(() => ({}));
            const manager =
                engine === 'MV' ? { loadNormalBitmap: load } : { loadBitmapFromUrl: load };
            const loader = createEncryptedImageLoader();
            expect(loader('/cache/foo.rpgmvp', manager, 45, true).smooth).toBe(true);
            expect(load.mock.calls[0][0]).toBe('data:image/png;base64,iVBORw==');
            if (engine === 'MV') expect(load.mock.calls[0][1]).toBe(45);
            expect(loader('/cache/foo.rpgmvp', manager, 0, false).smooth).toBe(false);
            expect(readFileSync).toHaveBeenCalledTimes(1);
            expect(decryptArrayBuffer).toHaveBeenCalledTimes(1);
        }
    );
});
