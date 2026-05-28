import { notifyTranslateCacheRuntimeChanged } from '../TranslateCacheRuntime.js';

const SEEN_UPDATED_NOTIFY_INTERVAL_MS = 1000;

function ensureSeenNotifyTimestamps(runtime) {
    if (!runtime.__lastSeenNotifyByCacheKey) {
        runtime.__lastSeenNotifyByCacheKey = new Map();
    }

    return runtime.__lastSeenNotifyByCacheKey;
}

function markCacheKeySeenInternal(runtime, cacheKey) {
    if (!runtime.shouldTrackRealtimeCacheUsage() || !runtime.lastSeenByCacheKey) {
        return;
    }

    if (typeof cacheKey !== 'string' || cacheKey.length === 0) {
        return;
    }

    const now = Date.now();
    runtime.lastSeenByCacheKey.set(cacheKey, now);

    const notifyTimestamps = ensureSeenNotifyTimestamps(runtime);
    const lastNotifiedAt = notifyTimestamps.get(cacheKey) || 0;
    if (now - lastNotifiedAt < SEEN_UPDATED_NOTIFY_INTERVAL_MS) {
        return;
    }

    notifyTimestamps.set(cacheKey, now);
    runtime.notifyCacheRuntime('seen-updated', cacheKey);
}

export const translateOnTheFlyCacheMethods = {
    clearCache() {
        const count = this.translationCache.size;
        const seenCount = this.lastSeenByCacheKey ? this.lastSeenByCacheKey.size : 0;
        this.translationCache.clear();
        if (this.reverseCommandLookup instanceof Map) {
            this.reverseCommandLookup.clear();
        }
        if (this.lastSeenByCacheKey) {
            this.lastSeenByCacheKey.clear();
        }
        if (this.__lastSeenNotifyByCacheKey) {
            this.__lastSeenNotifyByCacheKey.clear();
        }
        if (this.cacheBucketByCompositeKey) {
            this.cacheBucketByCompositeKey.clear();
        }
        this.persistCache();
        this.notifyCacheRuntime('cache-cleared');
        console.log(
            `[TranslateOnTheFly] Cleared ${count} cached translations and ${seenCount} seen timestamps`
        );
    },

    shouldTrackRealtimeCacheUsage() {
        return this.isTranslationEnabled() || !!this.enableTranslation;
    },

    isTranslatedCacheValue(value) {
        if (typeof value !== 'string') {
            return value !== null && value !== undefined;
        }

        return value !== '';
    },

    hasUsableCacheValue(cacheKey) {
        if (!cacheKey || !this.translationCache || !this.translationCache.has(cacheKey)) {
            return false;
        }

        return this.isTranslatedCacheValue(this.translationCache.get(cacheKey));
    },

    markBatchFailuresAsUntranslated(failures, markAsFailed = true) {
        if (!Array.isArray(failures) || failures.length === 0) {
            return;
        }

        for (const failure of failures) {
            if (!failure || !failure.cacheKey) {
                continue;
            }

            if (markAsFailed) {
                this.failedTranslations.set(failure.cacheKey, Date.now());
            }
        }
    },

    markBatchItemsAsUntranslated(items, markAsFailed = false) {
        if (!Array.isArray(items) || items.length === 0) {
            return;
        }

        for (const item of items) {
            if (!item || !item.cacheKey) {
                continue;
            }

            if (markAsFailed) {
                this.failedTranslations.set(item.cacheKey, Date.now());
            }
        }
    },

    trackCacheKeyUsage(cacheKey, options = {}) {
        if (!this.shouldTrackRealtimeCacheUsage()) {
            return;
        }

        if (typeof cacheKey !== 'string' || cacheKey.length === 0) {
            return;
        }

        const shouldHarvestMissing =
            options.harvestMissing === undefined ? true : !!options.harvestMissing;
        if (shouldHarvestMissing && this.translationCache && !this.translationCache.has(cacheKey)) {
            this.setCacheValue(cacheKey, '');
        }

        markCacheKeySeenInternal(this, cacheKey);
    },

    deleteCacheValue(cacheKey, options = {}) {
        if (!cacheKey || !this.translationCache.has(cacheKey)) {
            return;
        }

        this.translationCache.delete(cacheKey);
        if (
            typeof cacheKey === 'string' &&
            cacheKey.startsWith('command:') &&
            typeof this.removeReverseCommandLookupByCacheKey === 'function'
        ) {
            this.removeReverseCommandLookupByCacheKey(cacheKey);
        }
        if (options.deleteSeen !== false && this.lastSeenByCacheKey) {
            this.lastSeenByCacheKey.delete(cacheKey);
        }
        if (options.deleteSeen !== false && this.__lastSeenNotifyByCacheKey) {
            this.__lastSeenNotifyByCacheKey.delete(cacheKey);
        }
        if (options.persist !== false) {
            this.persistCache([cacheKey]);
        }
        if (options.notify !== false) {
            this.notifyCacheRuntime('cache-delete', cacheKey);
        }
    },

    notifyCacheRuntime(reason, key) {
        notifyTranslateCacheRuntimeChanged(reason || 'unknown', key);
    },
};
