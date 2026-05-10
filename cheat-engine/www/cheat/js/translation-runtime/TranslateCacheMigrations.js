/**
 * TranslateCacheMigrations.js
 *
 * Manages versioned migration of the on-disk and in-memory translate cache.
 *
 * Cache settings are stored in:
 *   ./www/cheat-settings/translate-cache/cache-settings.json
 *
 * Versioning:
 *   - No file + no cache files/data → initialize settings at CURRENT_CACHE_VERSION
 *   - No file + existing cache files/data → treat as version 0 and run all migrations
 *   - version 0 → run all migrations up to CURRENT_CACHE_VERSION
 *   - version >= CURRENT_CACHE_VERSION → nothing to do
 *
 * Migration history:
 *   v1 – Strip trailing \n characters from cache keys.
 *         RPG Maker pads message text with one \n per configured visible line,
 *         but the actual count varies between harvesting and seen-lookup contexts,
 *         causing spurious duplicate keys.
 *   v2 – Migrate legacy text.{langPair}.cache.json buckets into
 *         message.{langPair}.cache.json and remove text buckets.
 */

const SETTINGS_FILE_NAME = 'cache-settings.json';

export const CURRENT_CACHE_VERSION = 2;

// ---------------------------------------------------------------------------
// Public helpers used by the main runtime
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to cache-settings.json for the given runtime.
 * @param {object} runtime – TranslationRuntime instance
 * @returns {string}
 */
export function getCacheSettingsFilePath(runtime) {
    const path = require('path');
    return path.join(runtime.getSplitCacheDirectoryPath(), SETTINGS_FILE_NAME);
}

/**
 * Reads cache-settings.json from disk.
 * Returns null if the file does not exist or cannot be parsed.
 * @param {object} runtime – TranslationRuntime instance
 * @returns {{ version: number } | null}
 */
export function readCacheSettings(runtime) {
    const fs = runtime.getCacheFileSystem();
    const filePath = getCacheSettingsFilePath(runtime);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Atomically writes cache-settings.json to disk.
 * Caller must ensure the directory already exists.
 * @param {object} runtime – TranslationRuntime instance
 * @param {{ version: number }} settings
 */
export function writeCacheSettings(runtime, settings) {
    const fs = runtime.getCacheFileSystem();
    const filePath = getCacheSettingsFilePath(runtime);
    const data = `${JSON.stringify(settings, null, 2)}\n`;
    fs.writeFileSync(`${filePath}.tmp`, data, 'utf-8');
    fs.renameSync(`${filePath}.tmp`, filePath);
}

// ---------------------------------------------------------------------------
// Migration entry-point
// ---------------------------------------------------------------------------

/**
 * Checks whether any cache migrations are needed and runs them synchronously.
 * Must be called after the in-memory cache has been fully loaded from disk.
 *
 * @param {object} runtime – TranslationRuntime instance (has getCacheFileSystem,
 *   getSplitCacheDirectoryPath, translationCache, etc.)
 */
export function runCacheMigrationsIfNeeded(runtime) {
    const fs = runtime.getCacheFileSystem();
    const dirPath = runtime.getSplitCacheDirectoryPath();

    // If the cache directory does not exist there is nothing to migrate.
    if (!fs.existsSync(dirPath)) {
        return;
    }

    const settings = readCacheSettings(runtime);

    if (!settings) {
        const hasAnyCacheContent = _hasAnyCacheContent(runtime);
        if (!hasAnyCacheContent) {
            writeCacheSettings(runtime, { version: CURRENT_CACHE_VERSION });
            return;
        }
    }

    const storedVersion = settings && typeof settings.version === 'number' ? settings.version : 0;

    if (storedVersion >= CURRENT_CACHE_VERSION) {
        return;
    }

    let didMutateCache = false;

    if (storedVersion < 1) {
        didMutateCache = _migrateV1StripTrailingNewlines(runtime) || didMutateCache;
    }

    if (storedVersion < 2) {
        didMutateCache = _migrateV2TextBucketToMessageBucket(runtime) || didMutateCache;
    }

    if (didMutateCache) {
        _persistAllBucketsSync(runtime);
    }

    writeCacheSettings(runtime, { version: CURRENT_CACHE_VERSION });

    console.log(
        `[TranslateOnTheFly] Cache migrated from v${storedVersion} to v${CURRENT_CACHE_VERSION}`
    );
}

function _hasAnyCacheContent(runtime) {
    if (runtime.translationCache.size > 0) {
        return true;
    }

    return runtime.getAllSplitCacheBucketsFromDiskSync().length > 0;
}

// ---------------------------------------------------------------------------
// Individual migrations
// ---------------------------------------------------------------------------

import { isMapLike } from '../TranslateCacheRuntime.js';

/**
 * v1: Remove trailing \n characters from the text portion of every cache key.
 *
 * RPG Maker appends one \n per rendered message line when building the combined
 * text from consecutive 401 (SHOW_TEXT_LINE) commands, but the exact number
 * differs between the harvesting pass and the seen-lookup pass, producing keys
 * that differ only in trailing newlines.
 *
 * @param {object} runtime
 * @returns {boolean} true if any key was renamed
 */
function _migrateV1StripTrailingNewlines(runtime) {
    const cache = runtime.translationCache;
    if (!isMapLike(cache)) {
        return false;
    }

    const renames = [];
    for (const key of cache.keys()) {
        if (!key.endsWith('\n')) {
            continue;
        }
        const stripped = key.replace(/\n+$/, '');
        if (stripped !== key) {
            renames.push({ from: key, to: stripped });
        }
    }

    if (renames.length === 0) {
        return false;
    }

    for (const { from, to } of renames) {
        const value = cache.get(from);
        cache.delete(from);
        // Prefer any existing non-empty translation at the stripped key.
        if (!cache.has(to) || cache.get(to) === '') {
            cache.set(to, value);
        }
    }

    console.log(
        `[TranslateOnTheFly] Migration v1: renamed ${renames.length} cache key(s) (stripped trailing \\n)`
    );

    return true;
}

/**
 * v2: Migrate legacy text cache bucket into message bucket.
 *
 * Rules:
 *  - if text exists and message does not: move all keys to message
 *  - if both exist: merge per text key
 *      - if only one side has a usable translation, keep that value
 *      - if both have usable translations, keep message (newer)
 *      - otherwise keep message
 *  - remove text bucket file for every affected language pair
 *
 * @param {object} runtime
 * @returns {boolean} true if any migration work was applied
 */
function _migrateV2TextBucketToMessageBucket(runtime) {
    const cache = runtime.translationCache;
    if (!isMapLike(cache)) {
        return false;
    }

    const fs = runtime.getCacheFileSystem();
    const langPairs = _collectTextMigrationLangPairs(runtime);
    if (langPairs.size === 0) {
        console.log('[TranslateOnTheFly] Migration v2: no legacy text buckets found');
        return false;
    }

    let didMutateCache = false;
    let movedEntries = 0;
    let mergedEntries = 0;
    let renamedFiles = 0;
    let deletedFiles = 0;

    for (const langPair of langPairs) {
        const textBucketId = runtime.getCacheBucketId('text', langPair);
        const messageBucketId = runtime.getCacheBucketId('message', langPair);
        const textFilePath = runtime.getSplitCacheFilePathFromBucketId(textBucketId);
        const messageFilePath = runtime.getSplitCacheFilePathFromBucketId(messageBucketId);
        const textFileExists = !!textFilePath && fs.existsSync(textFilePath);
        const messageFileExists = !!messageFilePath && fs.existsSync(messageFilePath);

        if (textFileExists && !messageFileExists && textFilePath && messageFilePath) {
            try {
                fs.renameSync(textFilePath, messageFilePath);
                renamedFiles++;
            } catch (error) {
                console.warn(
                    `[TranslateOnTheFly] Migration v2: failed to rename ${textFilePath} to ${messageFilePath}`,
                    error
                );
            }
        }

        const prefixes = {
            text: `text:${langPair}-`,
            message: `message:${langPair}-`,
        };
        const textEntries = new Map();
        const messageEntries = new Map();

        for (const [compositeKey, value] of cache.entries()) {
            if (compositeKey.startsWith(prefixes.text)) {
                textEntries.set(compositeKey.slice(prefixes.text.length), value);
                continue;
            }

            if (compositeKey.startsWith(prefixes.message)) {
                messageEntries.set(compositeKey.slice(prefixes.message.length), value);
            }
        }

        if (textEntries.size === 0) {
            continue;
        }

        for (const [textKey, textValue] of textEntries.entries()) {
            const hasMessage = messageEntries.has(textKey);
            if (!hasMessage) {
                messageEntries.set(textKey, textValue);
                movedEntries++;
                didMutateCache = true;
                continue;
            }

            const messageValue = messageEntries.get(textKey);
            const textHasTranslation = _hasUsableTextTranslation(textValue);
            const messageHasTranslation = _hasUsableTextTranslation(messageValue);

            if (!messageHasTranslation && textHasTranslation) {
                messageEntries.set(textKey, textValue);
                mergedEntries++;
                didMutateCache = true;
            }
        }

        for (const textKey of textEntries.keys()) {
            cache.delete(`${prefixes.text}${textKey}`);
            didMutateCache = true;
        }

        for (const [textKey, messageValue] of messageEntries.entries()) {
            const messageCompositeKey = `${prefixes.message}${textKey}`;
            if (cache.get(messageCompositeKey) !== messageValue) {
                cache.set(messageCompositeKey, messageValue);
                didMutateCache = true;
            }
        }

        if (textFilePath && fs.existsSync(textFilePath)) {
            try {
                fs.unlinkSync(textFilePath);
                deletedFiles++;
            } catch (error) {
                console.warn(
                    `[TranslateOnTheFly] Migration v2: failed to remove legacy text cache file ${textFilePath}`,
                    error
                );
            }
        }
    }

    if (didMutateCache) {
        runtime.cacheBucketByCompositeKey = new Map();
        for (const compositeKey of cache.keys()) {
            runtime.rememberCacheBucketForKey(compositeKey);
        }
    }

    console.log(
        `[TranslateOnTheFly] Migration v2: langPairs=${langPairs.size}, moved=${movedEntries}, merged=${mergedEntries}, renamedFiles=${renamedFiles}, deletedFiles=${deletedFiles}`
    );

    return didMutateCache || renamedFiles > 0 || deletedFiles > 0;
}

function _collectTextMigrationLangPairs(runtime) {
    const langPairs = new Set();

    for (const bucketId of runtime.getAllSplitCacheBucketsFromDiskSync()) {
        const parsed = runtime.parseCacheBucketId(bucketId);
        if (!parsed || parsed.type !== 'text') {
            continue;
        }

        langPairs.add(parsed.langPair);
    }

    for (const compositeKey of runtime.translationCache.keys()) {
        const parsed = runtime.parseCompositeCacheKey(compositeKey);
        if (!parsed || parsed.type !== 'text') {
            continue;
        }

        langPairs.add(parsed.langPair);
    }

    return langPairs;
}

function _hasUsableTextTranslation(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Rewrites every cache bucket file from the current in-memory state.
 * Called synchronously after a migration has mutated the in-memory cache.
 * @param {object} runtime
 */
function _persistAllBucketsSync(runtime) {
    // Rebuild the key→bucket mapping from scratch so renamed keys are tracked correctly.
    runtime.cacheBucketByCompositeKey = new Map();

    const buckets = new Map();

    for (const [compositeKey, value] of runtime.translationCache.entries()) {
        runtime.rememberCacheBucketForKey(compositeKey);
        const bucketId = runtime.getBucketForCacheKey(compositeKey);
        if (!bucketId) {
            continue;
        }

        const parsed = runtime.parseCacheBucketId(bucketId);
        if (!parsed) {
            continue;
        }

        const prefix = `${parsed.type}:${parsed.langPair}-`;
        if (!compositeKey.startsWith(prefix)) {
            continue;
        }

        const textKey = compositeKey.slice(prefix.length);
        if (!buckets.has(bucketId)) {
            buckets.set(bucketId, {});
        }
        buckets.get(bucketId)[textKey] = value;
    }

    for (const [bucketId, payload] of buckets.entries()) {
        const filePath = runtime.getSplitCacheFilePathFromBucketId(bucketId);
        if (filePath) {
            runtime.writeJsonFileAtomicSync(filePath, payload);
        }
    }
}
