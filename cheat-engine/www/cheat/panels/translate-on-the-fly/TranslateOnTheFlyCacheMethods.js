import { notifyTranslateCacheRuntimeChanged } from '../../js/TranslateCacheRuntime.js';

export const translateOnTheFlyCacheMethods = {
    clearCache() {
        const count = this.translationCache.size;
        const seenCount = this.lastSeenByCacheKey ? this.lastSeenByCacheKey.size : 0;
        this.translationCache.clear();
        if (this.lastSeenByCacheKey) {
            this.lastSeenByCacheKey.clear();
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
        return this.isTranslationEnabled() || !!this.translateCacheWhenDisabled;
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

        this.markCacheKeySeen(cacheKey);
    },

    markCacheKeySeen(cacheKey) {
        if (!this.shouldTrackRealtimeCacheUsage() || !this.lastSeenByCacheKey) {
            return;
        }

        if (typeof cacheKey !== 'string' || cacheKey.length === 0) {
            return;
        }

        this.lastSeenByCacheKey.set(cacheKey, Date.now());
        this.notifyCacheRuntime('seen-updated', cacheKey);
    },

    deleteCacheValue(cacheKey, options = {}) {
        if (!cacheKey || !this.translationCache.has(cacheKey)) {
            return;
        }

        this.translationCache.delete(cacheKey);
        if (options.deleteSeen !== false && this.lastSeenByCacheKey) {
            this.lastSeenByCacheKey.delete(cacheKey);
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
