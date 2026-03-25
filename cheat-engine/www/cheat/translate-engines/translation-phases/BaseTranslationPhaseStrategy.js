export class BaseTranslationPhaseStrategy {
  getTranslationPhaseLabel() {
    throw new Error(
      "getTranslationPhaseLabel() must be implemented by strategy",
    );
  }

  collectUntranslated() {
    throw new Error("collectUntranslated() must be implemented by strategy");
  }

  toTranslationBatchItems(pendingItems) {
    const safePendingItems = Array.isArray(pendingItems) ? pendingItems : [];
    return safePendingItems.map((item) => ({
      type: item.type,
      id: item.id,
      value: item.value,
      cacheKey: item.cacheKey,
    }));
  }

  setData({ panel, successes, failures }) {
    for (const success of successes || []) {
      if (!success || !success.cacheKey) {
        continue;
      }

      panel.setCacheValue(success.cacheKey, success.translated);
    }

    const shouldMarkFailures =
      typeof this.shouldMarkFailuresAsFailed === "function"
        ? this.shouldMarkFailuresAsFailed()
        : true;
    panel.markBatchFailuresAsUntranslated(failures || [], shouldMarkFailures);

    const shouldCacheFailuresAsEmpty =
      typeof this.shouldCacheFailuresAsEmpty === "function"
        ? this.shouldCacheFailuresAsEmpty()
        : false;
    if (shouldCacheFailuresAsEmpty) {
      for (const failure of failures || []) {
        if (!failure || !failure.cacheKey) {
          continue;
        }

        const hasUsable =
          typeof panel.hasUsableCacheValue === "function"
            ? panel.hasUsableCacheValue(failure.cacheKey)
            : false;
        if (!hasUsable) {
          panel.setCacheValue(failure.cacheKey, "");
        }
      }
    }
  }

  shouldMarkFailuresAsFailed() {
    return true;
  }

  shouldCacheFailuresAsEmpty() {
    return false;
  }

  finalizePhase() {
    // Optional hook for strategies that need post-batch data materialization.
  }
}
