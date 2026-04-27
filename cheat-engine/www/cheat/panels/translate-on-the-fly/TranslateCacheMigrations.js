/**
 * TranslateCacheMigrations.js
 *
 * Manages versioned migration of the on-disk and in-memory translate cache.
 *
 * Cache settings are stored in:
 *   ./www/cheat-settings/translate-cache/cache-settings.json
 *
 * Versioning:
 *   - No file / version 0 → run all migrations up to CURRENT_CACHE_VERSION
 *   - version >= CURRENT_CACHE_VERSION → nothing to do
 *
 * Migration history:
 *   v1 – Strip trailing \n characters from cache keys.
 *         RPG Maker pads message text with one \n per configured visible line,
 *         but the actual count varies between harvesting and seen-lookup contexts,
 *         causing spurious duplicate keys.
 */

const SETTINGS_FILE_NAME = 'cache-settings.json';

export const CURRENT_CACHE_VERSION = 1;

// ---------------------------------------------------------------------------
// Public helpers used by the main runtime
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to cache-settings.json for the given panel.
 * @param {object} panel – TranslationRuntime instance
 * @returns {string}
 */
export function getCacheSettingsFilePath(panel) {
    const path = require('path');
    return path.join(panel.getSplitCacheDirectoryPath(), SETTINGS_FILE_NAME);
}

/**
 * Reads cache-settings.json from disk.
 * Returns null if the file does not exist or cannot be parsed.
 * @param {object} panel – TranslationRuntime instance
 * @returns {{ version: number } | null}
 */
export function readCacheSettings(panel) {
    const fs = panel.getCacheFileSystem();
    const filePath = getCacheSettingsFilePath(panel);
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
 * @param {object} panel – TranslationRuntime instance
 * @param {{ version: number }} settings
 */
export function writeCacheSettings(panel, settings) {
    const fs = panel.getCacheFileSystem();
    const filePath = getCacheSettingsFilePath(panel);
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
 * @param {object} panel – TranslationRuntime instance (has getCacheFileSystem,
 *   getSplitCacheDirectoryPath, translationCache, etc.)
 */
export function runCacheMigrationsIfNeeded(panel) {
    const fs = panel.getCacheFileSystem();
    const dirPath = panel.getSplitCacheDirectoryPath();

    // If the cache directory does not exist there is nothing to migrate.
    if (!fs.existsSync(dirPath)) {
        return;
    }

    const settings = readCacheSettings(panel);
    const storedVersion =
        settings && typeof settings.version === 'number' ? settings.version : 0;

    if (storedVersion >= CURRENT_CACHE_VERSION) {
        return;
    }

    let didMutateCache = false;

    if (storedVersion < 1) {
        didMutateCache = _migrateV1StripTrailingNewlines(panel) || didMutateCache;
    }

    if (didMutateCache) {
        _persistAllBucketsSync(panel);
    }

    writeCacheSettings(panel, { version: CURRENT_CACHE_VERSION });

    console.log(
        `[TranslateOnTheFly] Cache migrated from v${storedVersion} to v${CURRENT_CACHE_VERSION}`
    );
}

// ---------------------------------------------------------------------------
// Individual migrations
// ---------------------------------------------------------------------------

import { isMapLike } from '../../js/TranslateCacheRuntime.js';

/**
 * v1: Remove trailing \n characters from the text portion of every cache key.
 *
 * RPG Maker appends one \n per rendered message line when building the combined
 * text from consecutive 401 (SHOW_TEXT_LINE) commands, but the exact number
 * differs between the harvesting pass and the seen-lookup pass, producing keys
 * that differ only in trailing newlines.
 *
 * @param {object} panel
 * @returns {boolean} true if any key was renamed
 */
function _migrateV1StripTrailingNewlines(panel) {
    const cache = panel.translationCache;
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Rewrites every cache bucket file from the current in-memory state.
 * Called synchronously after a migration has mutated the in-memory cache.
 * @param {object} panel
 */
function _persistAllBucketsSync(panel) {
    // Rebuild the key→bucket mapping from scratch so renamed keys are tracked correctly.
    panel.cacheBucketByCompositeKey = new Map();

    const buckets = new Map();

    for (const [compositeKey, value] of panel.translationCache.entries()) {
        panel.rememberCacheBucketForKey(compositeKey);
        const bucketId = panel.getBucketForCacheKey(compositeKey);
        if (!bucketId) {
            continue;
        }

        const parsed = panel.parseCacheBucketId(bucketId);
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
        const filePath = panel.getSplitCacheFilePathFromBucketId(bucketId);
        if (filePath) {
            panel.writeJsonFileAtomicSync(filePath, payload);
        }
    }
}
