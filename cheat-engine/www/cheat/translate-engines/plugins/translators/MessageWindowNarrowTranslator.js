import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * MessageWindowNarrow (MV, source has no version number).
 * Also named MessageWindowCenter_OffsetXY_NameSprite in its source header.
 * Reads a leading 【name】 from event dialogue and loads UI_name_<name>.
 * Dialogue scanning/translation belongs to the standard message phases; names
 * here are image identifiers, not additional strings to translate.
 * Restore the image identifier from the current original message, with a
 * reverse lookup of message cache headers for previously translated dialogue.
 */
const PICTURE_PREFIX = 'UI_name_';

function getPictureName(text) {
    return text?.match(/^【(.+?)】/)?.[1].replaceAll('\\', '');
}

export class MessageWindowNarrowTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MessageWindowNarrow';
    }

    getPluginAliases() {
        return [this.getPluginName(), 'MessageWindowCenter_OffsetXY_NameSprite'];
    }

    getCacheType() {
        return 'plugin_message_window_narrow';
    }

    collectUntranslated() {
        return [];
    }

    resolvePictureName(name, runtime) {
        const message = window.$gameMessage;
        const originalName = getPictureName(message?._translateOriginalText);
        if (originalName && getPictureName(message.allText()) === name) {
            return originalName;
        }

        // Match only the active language pair and message caches. A name can
        // translate differently in each dialogue; conflicting originals must
        // not be resolved arbitrarily.
        let resolvedName;
        const matchingKeys = [];
        for (const type of ['message', 'message_portrait']) {
            const prefix = runtime.getCacheKey('', type);
            for (const [key, translated] of runtime.translationCache) {
                if (!key.startsWith(prefix) || !this.isUsableText(translated)) continue;
                const sourceName = getPictureName(key.slice(prefix.length));
                if (!sourceName || getPictureName(translated) !== name) continue;
                if (resolvedName && resolvedName !== sourceName) return name;
                resolvedName = sourceName;
                matchingKeys.push(key);
            }
        }
        for (const key of matchingKeys) {
            runtime.trackCacheKeyUsage(key, { harvestMissing: false });
        }
        return resolvedName || name;
    }

    enablePluginTranslation() {
        if (typeof window.ImageManager?.loadPicture !== 'function') return false;

        const translator = this;
        const originalLoadPicture = window.ImageManager.loadPicture;
        window.ImageManager.loadPicture = function (filename, ...args) {
            const runtime = translator.getRuntime();
            if (
                translator.isRuntimeTranslationActive(runtime) &&
                typeof filename === 'string' &&
                filename.startsWith(PICTURE_PREFIX)
            ) {
                filename =
                    PICTURE_PREFIX +
                    translator.resolvePictureName(filename.slice(PICTURE_PREFIX.length), runtime);
            }
            return originalLoadPicture.call(this, filename, ...args);
        };
        return true;
    }
}
