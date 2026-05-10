export class BasePhase {
    getTranslationPhaseLabel() {
        throw new Error('getTranslationPhaseLabel() must be implemented by strategy');
    }

    collectUntranslated() {
        throw new Error('collectUntranslated() must be implemented by strategy');
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

    setData({ runtime, successes, failures }) {
        for (const success of successes || []) {
            if (!success || !success.cacheKey) {
                continue;
            }

            runtime.setCacheValue(success.cacheKey, success.translated);
        }

        runtime.markBatchFailuresAsUntranslated(failures || [], true);
    }

    finalizePhase() {
        // Optional hook for strategies that need post-batch data materialization.
    }

    applyDataOnLifecycle() {
        return true;
    }
}
