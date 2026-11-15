export function createTranslatedImagePathResolver({ ttl = 1000, maxEntries = 2048 } = {}) {
    const cache = new Map();
    let fs;
    let path;
    return (directory, basename) => {
        const key = `${directory}\u0000${basename}`;
        const now = Date.now();
        const cached = cache.get(key);
        if (cached && now - cached.time < ttl) return cached.value;
        fs ??= globalThis.require('fs');
        path ??= globalThis.require('path');
        const value = findTranslatedImagePath(fs, path, directory, basename);
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
        cache.set(key, { time: now, value });
        return value;
    };
}

export function findTranslatedImagePath(fs, path, directory, basename) {
    for (const extension of ['.png', '.rpgmvp']) {
        const candidate = path.resolve(directory, `${basename}${extension}`);
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

// Retain decoded URLs so ImageManager can reuse its normal bitmap/hue cache.
export function createEncryptedImageLoader() {
    const urls = new Map();
    return (filename, manager, hue, smooth) => {
        let url = urls.get(filename);
        if (!url) {
            const bytes = globalThis.require('fs').readFileSync(filename);
            const source = bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength
            );
            const decrypter = globalThis.Decrypter;
            const utils = globalThis.Utils;
            const decoder = typeof decrypter?.decryptArrayBuffer === 'function' ? decrypter : utils;
            if (typeof decoder?.decryptArrayBuffer !== 'function') {
                throw new Error('Image decryption API is unavailable');
            }
            const decoded = decoder.decryptArrayBuffer(source);
            url = `data:image/png;base64,${globalThis.require('buffer').Buffer.from(decoded).toString('base64')}`;
            urls.set(filename, url);
        }
        const bitmap =
            typeof manager.loadNormalBitmap === 'function'
                ? manager.loadNormalBitmap(url, hue || 0)
                : manager.loadBitmapFromUrl(url);
        bitmap.smooth = smooth;
        return bitmap;
    };
}
