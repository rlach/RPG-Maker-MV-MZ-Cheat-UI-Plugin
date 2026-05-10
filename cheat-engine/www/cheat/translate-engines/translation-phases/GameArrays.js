import { BasePhase } from './BasePhase.js';

export class GameArrays extends BasePhase {
    getKind() {
        return 'gameArrays';
    }

    applyDataOnLifecycle(context = {}) {
        const runtime = context?.runtime;
        if (!runtime) {
            return true;
        }

        const arrays = runtime.getGameArrayDefs();
        this.applyCachedTranslationsToArrays(runtime, arrays);
        return true;
    }

    applyCachedTranslationsToArrays(runtime, arrays) {
        for (const entry of arrays || []) {
            const parentObj = entry ? entry.parent() : null;
            if (!parentObj || !Array.isArray(parentObj[entry.prop])) {
                continue;
            }

            try {
                const liveArr = parentObj[entry.prop];
                const hasOriginal = Array.isArray(parentObj[`${entry.prop}Original`]);
                const originalCopy = hasOriginal
                    ? parentObj[`${entry.prop}Original`]
                    : Array.isArray(liveArr)
                      ? liveArr.slice()
                      : [];
                if (!hasOriginal) {
                    parentObj[`${entry.prop}Original`] = originalCopy.slice();
                }

                for (let i = 0; i < originalCopy.length; i++) {
                    const value = originalCopy[i];
                    if (value == null || typeof value !== 'string' || value.trim() === '') {
                        parentObj[entry.prop][i] = value;
                        continue;
                    }

                    const trimmed = value.trim();
                    const primaryKey = runtime.getCacheKey(trimmed, entry.type);
                    if (runtime.hasUsableCacheValue(primaryKey)) {
                        parentObj[entry.prop][i] = runtime.translationCache.get(primaryKey);
                        continue;
                    }

                    let applied = false;
                    for (const fallbackEntry of arrays) {
                        const fallbackKey = runtime.getCacheKey(trimmed, fallbackEntry.type);
                        if (runtime.hasUsableCacheValue(fallbackKey)) {
                            parentObj[entry.prop][i] = runtime.translationCache.get(fallbackKey);
                            applied = true;
                            break;
                        }
                    }

                    if (!applied) {
                        parentObj[entry.prop][i] = value;
                    }
                }
            } catch (error) {
                console.error(
                    '[TranslateOnTheFly] Failed to apply translated game arrays for',
                    entry && entry.prop,
                    error
                );
            }
        }
    }

    async createEntries({ runtime }) {
        const arrays = runtime.getGameArrayDefs();
        const candidates = runtime.collectGameArrayCandidates();
        const pendingValues = Array.isArray(candidates && candidates.pendingValues)
            ? candidates.pendingValues
            : [];

        const items = [];
        let idCounter = 0;
        for (const pv of pendingValues) {
            if (!pv || typeof pv.value !== 'string') {
                continue;
            }

            items.push({
                type: pv.types && pv.types[0] ? pv.types[0] : 'text',
                id: `sys_${idCounter++}`,
                value: pv.value,
                cacheKey: runtime.getCacheKey(
                    pv.value,
                    pv.types && pv.types[0] ? pv.types[0] : 'text'
                ),
            });
        }

        const metaByCacheKey = new Map(
            pendingValues
                .filter((pv) => pv && typeof pv.value === 'string')
                .map((pv) => [
                    runtime.getCacheKey(pv.value, pv.types && pv.types[0] ? pv.types[0] : 'text'),
                    pv,
                ])
        );

        return [
            {
                strategy: {
                    getTranslationPhaseLabel() {
                        return 'translating arrays';
                    },
                    collectUntranslated() {
                        return items;
                    },
                    async setData({ runtime: panelRef, successes }) {
                        for (const success of successes || []) {
                            if (!success || !success.cacheKey) {
                                continue;
                            }

                            const meta = metaByCacheKey.get(success.cacheKey);
                            const types = meta && Array.isArray(meta.types) ? meta.types : [];
                            for (const type of types) {
                                panelRef.setCacheValue(
                                    panelRef.getCacheKey(success.value, type),
                                    success.translated
                                );
                            }
                        }
                    },
                    finalizePhase: () => {
                        this.applyCachedTranslationsToArrays(runtime, arrays);
                    },
                },
                priorityMapId: 0,
            },
        ];
    }

    countAmountSync({ runtime }) {
        return runtime.countGameArraysStats();
    }
}
