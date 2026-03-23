import { notifyTranslateCacheRuntimeChanged } from "../../js/TranslateCacheRuntime.js";

export const translateOnTheFlyCacheMethods = {
  clearCache() {
    const count = this.translationCache.size;
    const seenCount = this.lastSeenByCacheKey
      ? this.lastSeenByCacheKey.size
      : 0;
    this.translationCache.clear();
    if (this.lastSeenByCacheKey) {
      this.lastSeenByCacheKey.clear();
    }
    this.persistCache();
    this.notifyCacheRuntime("cache-cleared");
    console.log(
      `[TranslateOnTheFly] Cleared ${count} cached translations and ${seenCount} seen timestamps`,
    );
  },

  shouldTrackRealtimeCacheUsage() {
    return this.isTranslationEnabled() || !!this.translateCacheWhenDisabled;
  },

  isRealtimeTrackableType(type) {
    return type === "text" || type === "choice";
  },

  isTranslatedCacheValue(value) {
    if (typeof value !== "string") {
      return value !== null && value !== undefined;
    }

    return value !== "";
  },

  hasUsableCacheValue(cacheKey) {
    if (
      !cacheKey ||
      !this.translationCache ||
      !this.translationCache.has(cacheKey)
    ) {
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

  getCacheKeyType(cacheKey) {
    if (typeof cacheKey !== "string") {
      return "";
    }

    const idx = cacheKey.indexOf(":");
    if (idx <= 0) {
      return "";
    }

    return cacheKey.slice(0, idx);
  },

  ensureRealtimeTrackedCacheEntry(value, type) {
    if (
      !this.shouldTrackRealtimeCacheUsage() ||
      !this.isRealtimeTrackableType(type)
    ) {
      return null;
    }

    if (typeof value !== "string" || value.trim() === "") {
      return null;
    }

    const cacheKey = this.getCacheKey(value, type);
    return cacheKey;
  },

  markCacheKeySeen(cacheKey, type = null) {
    if (!this.shouldTrackRealtimeCacheUsage() || !this.lastSeenByCacheKey) {
      return;
    }

    const resolvedType = type || this.getCacheKeyType(cacheKey);
    if (!this.isRealtimeTrackableType(resolvedType)) {
      return;
    }

    this.lastSeenByCacheKey.set(cacheKey, Date.now());
    this.notifyCacheRuntime("seen-updated", cacheKey);
  },

  touchRealtimeEntry(value, type) {
    const cacheKey = this.ensureRealtimeTrackedCacheEntry(value, type);
    if (cacheKey) {
      this.markCacheKeySeen(cacheKey, type);
    }

    return cacheKey;
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
      this.persistCache();
    }
    if (options.notify !== false) {
      this.notifyCacheRuntime("cache-delete", cacheKey);
    }
  },

  notifyCacheRuntime(reason = "unknown", key = null) {
    notifyTranslateCacheRuntimeChanged(reason, key);
  },
};
