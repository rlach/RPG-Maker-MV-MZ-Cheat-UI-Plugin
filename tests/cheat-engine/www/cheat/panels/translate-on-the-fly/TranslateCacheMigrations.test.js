import { describe, expect, it } from 'vitest';
import {
    CURRENT_CACHE_VERSION,
    getCacheSettingsFilePath,
    runCacheMigrationsIfNeeded,
} from '../../../../../../cheat-engine/www/cheat/panels/translate-on-the-fly/TranslateCacheMigrations.js';

class MemoryFs {
    constructor({ files = {}, directories = [] } = {}) {
        this.files = new Map(Object.entries(files));
        this.directories = new Set(directories);
    }

    existsSync(targetPath) {
        return this.files.has(targetPath) || this.directories.has(targetPath);
    }

    readFileSync(targetPath) {
        if (!this.files.has(targetPath)) {
            throw new Error(`ENOENT: ${targetPath}`);
        }
        return this.files.get(targetPath);
    }

    writeFileSync(targetPath, content) {
        this.files.set(targetPath, content);
        this.directories.add(_getParentDirectory(targetPath));
    }

    renameSync(fromPath, toPath) {
        if (!this.files.has(fromPath)) {
            throw new Error(`ENOENT: ${fromPath}`);
        }
        this.files.set(toPath, this.files.get(fromPath));
        this.files.delete(fromPath);
        this.directories.add(_getParentDirectory(toPath));
    }

    unlinkSync(targetPath) {
        if (!this.files.has(targetPath)) {
            throw new Error(`ENOENT: ${targetPath}`);
        }
        this.files.delete(targetPath);
    }
}

function _getParentDirectory(filePath) {
    const separatorIndex = filePath.lastIndexOf('/');
    return separatorIndex >= 0 ? filePath.slice(0, separatorIndex) : '';
}

function createPanel({ fs, cacheEntries = [], diskBuckets = [] }) {
    const cacheBucketByCompositeKey = new Map();

    const panel = {
        translationCache: new Map(cacheEntries),
        cacheBucketByCompositeKey,
        sourceLang: 'ja',
        targetLang: 'en',

        getCacheFileSystem() {
            return fs;
        },

        getSplitCacheDirectoryPath() {
            return '/cache';
        },

        getAllSplitCacheBucketsFromDiskSync() {
            return diskBuckets.slice();
        },

        getCacheBucketId(type, langPair) {
            return `${type}:${langPair}`;
        },

        parseCacheBucketId(bucketId) {
            if (typeof bucketId !== 'string') {
                return null;
            }

            const separatorIndex = bucketId.indexOf(':');
            if (separatorIndex <= 0 || separatorIndex >= bucketId.length - 1) {
                return null;
            }

            return {
                type: bucketId.slice(0, separatorIndex),
                langPair: bucketId.slice(separatorIndex + 1),
            };
        },

        getSplitCacheFilePathFromBucketId(bucketId) {
            const parsed = this.parseCacheBucketId(bucketId);
            if (!parsed) {
                return null;
            }
            return `/cache/${parsed.type}.${parsed.langPair}.cache.json`;
        },

        parseCompositeCacheKey(compositeKey) {
            if (typeof compositeKey !== 'string') {
                return null;
            }

            const matched = compositeKey.match(/^([^:]+):([^-]+-[^-]+)-([\s\S]*)$/);
            if (!matched) {
                return null;
            }

            return {
                type: matched[1],
                langPair: matched[2],
                textKey: matched[3],
            };
        },

        rememberCacheBucketForKey(compositeKey) {
            const parsed = this.parseCompositeCacheKey(compositeKey);
            if (!parsed) {
                return;
            }

            this.cacheBucketByCompositeKey.set(
                compositeKey,
                this.getCacheBucketId(parsed.type, parsed.langPair)
            );
        },

        getBucketForCacheKey(compositeKey) {
            if (!this.cacheBucketByCompositeKey.has(compositeKey)) {
                this.rememberCacheBucketForKey(compositeKey);
            }
            return this.cacheBucketByCompositeKey.get(compositeKey) || null;
        },

        writeJsonFileAtomicSync(filePath, payload) {
            const data = `${JSON.stringify(payload, null, 2)}\n`;
            fs.writeFileSync(`${filePath}.tmp`, data, 'utf-8');
            fs.renameSync(`${filePath}.tmp`, filePath);
        },
    };

    for (const key of panel.translationCache.keys()) {
        panel.rememberCacheBucketForKey(key);
    }

    return panel;
}

describe('TranslateCacheMigrations', () => {
    it('initializes settings to current version when no settings and no cache content exist', () => {
        const fs = new MemoryFs({ directories: ['/cache'] });
        const panel = createPanel({ fs, cacheEntries: [], diskBuckets: [] });

        runCacheMigrationsIfNeeded(panel);

        const settingsPath = getCacheSettingsFilePath(panel);
        const settings = JSON.parse(fs.readFileSync(settingsPath));
        expect(settings.version).toBe(CURRENT_CACHE_VERSION);
    });

    it('treats missing settings as version 0 when legacy text cache exists and migrates to message', () => {
        const textBucketPath = '/cache/text.ja-en.cache.json';
        const messageBucketPath = '/cache/message.ja-en.cache.json';
        const fs = new MemoryFs({
            directories: ['/cache'],
            files: {
                [textBucketPath]: '{"hello":"czesc"}\n',
            },
        });
        const panel = createPanel({
            fs,
            cacheEntries: [['text:ja-en-hello', 'czesc']],
            diskBuckets: ['text:ja-en'],
        });

        runCacheMigrationsIfNeeded(panel);

        const settingsPath = getCacheSettingsFilePath(panel);
        const settings = JSON.parse(fs.readFileSync(settingsPath));
        expect(settings.version).toBe(CURRENT_CACHE_VERSION);

        expect(panel.translationCache.has('text:ja-en-hello')).toBe(false);
        expect(panel.translationCache.get('message:ja-en-hello')).toBe('czesc');
        expect(fs.existsSync(textBucketPath)).toBe(false);
        expect(fs.existsSync(messageBucketPath)).toBe(true);
    });
});
