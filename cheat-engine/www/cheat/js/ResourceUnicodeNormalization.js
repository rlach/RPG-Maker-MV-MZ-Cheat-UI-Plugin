/** Normalize only changed resource URLs; preserve existing escaping otherwise. */
export function normalizeResourceUrl(url) {
    if (typeof url !== 'string') return url;
    try {
        const decoded = decodeURI(url);
        const normalized = decoded.normalize('NFC');
        return normalized === decoded ? url : encodeURI(normalized);
    } catch {
        return url.normalize('NFC');
    }
}

/** Core MV/MZ image and audio entry points, including encrypted resources. */
export function installResourceUnicodeNormalization(root, isEnabled) {
    const wrap = (owner, name) => {
        const original = owner?.[name];
        if (typeof original !== 'function' || original.__cheatUnicodeNormalization) return;
        const wrapped = function (url, ...args) {
            return original.call(this, isEnabled() ? normalizeResourceUrl(url) : url, ...args);
        };
        wrapped.__cheatUnicodeNormalization = true;
        owner[name] = wrapped;
    };
    wrap(root?.Bitmap, 'load');
    wrap(root?.Bitmap, 'request');
    wrap(root?.WebAudio?.prototype, 'initialize');
    wrap(root?.Html5Audio, 'setup');
}
