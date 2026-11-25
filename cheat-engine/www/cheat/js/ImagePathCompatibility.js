import { getRootWindow } from './RootWindowState.js';
import { isHookAlreadyApplied, markHookAsApplied } from './HookGuardHelper.js';

const HOOK = 'CHEAT_IMAGE_PATH_COMPATIBILITY';

/** Legacy MV loaders encode the entire filename, including subdirectories.
 * Restore separators only in local image URLs, leaving escaped filename bytes,
 * literal percent sequences, remote URLs and encrypted extensions untouched.
 */
export function normalizeLocalImagePath(url) {
    if (typeof url !== 'string' || !/^(?:\.\/)?img\//i.test(url)) return url;
    return url.replace(/%2f|%5c/gi, '/');
}

/** Independent of translation settings; native loading/decryption/cache stay in charge. */
export function installImagePathCompatibility() {
    const root = getRootWindow();
    const bitmap = root.Bitmap;
    if (typeof bitmap?.load !== 'function') return false;
    if (isHookAlreadyApplied(HOOK)) return true;
    // MV uses _requestImage for both eager loads and deferred request queues.
    // MZ starts loading from Bitmap.load. Wrap both entry points so queued MV
    // requests and subsequent native retry callbacks use corrected resource URLs.
    if (typeof bitmap.prototype?._requestImage === 'function') {
        const request = bitmap.prototype._requestImage;
        bitmap.prototype._requestImage = function (url, ...args) {
            return request.call(this, normalizeLocalImagePath(url), ...args);
        };
    }
    for (const name of ['load', 'request']) {
        const original = bitmap[name];
        if (typeof original !== 'function') continue;
        bitmap[name] = function (url, ...args) {
            return original.call(this, normalizeLocalImagePath(url), ...args);
        };
    }
    markHookAsApplied(HOOK);
    return true;
}
