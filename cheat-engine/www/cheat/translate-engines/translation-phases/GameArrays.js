import { BaseTranslationPhaseStrategy } from "./BasePhase.js";

export class GameArraysTranslationKindStrategy extends BaseTranslationPhaseStrategy {
  getKind() {
    return "gameArrays";
  }

  applyCachedTranslationsToArrays(panel, arrays) {
    for (const entry of arrays || []) {
      const parentObj =
        entry && typeof entry.parent === "function" ? entry.parent() : null;
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
          if (
            value == null ||
            typeof value !== "string" ||
            value.trim() === ""
          ) {
            parentObj[entry.prop][i] = value;
            continue;
          }

          const trimmed = value.trim();
          const primaryKey = panel.getCacheKey(trimmed, entry.type);
          if (panel.hasUsableCacheValue(primaryKey)) {
            parentObj[entry.prop][i] = panel.translationCache.get(primaryKey);
            continue;
          }

          let applied = false;
          for (const fallbackEntry of arrays) {
            const fallbackKey = panel.getCacheKey(trimmed, fallbackEntry.type);
            if (panel.hasUsableCacheValue(fallbackKey)) {
              parentObj[entry.prop][i] =
                panel.translationCache.get(fallbackKey);
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
          "[TranslateOnTheFly] Failed to apply translated game arrays for",
          entry && entry.prop,
          error,
        );
      }
    }
  }

  async createEntries({ panel }) {
    const arrays =
      typeof panel.getGameArrayDefs === "function"
        ? panel.getGameArrayDefs()
        : [];
    const candidates =
      typeof panel.collectGameArrayCandidates === "function"
        ? panel.collectGameArrayCandidates()
        : { pendingValues: [] };
    const pendingValues = Array.isArray(candidates && candidates.pendingValues)
      ? candidates.pendingValues
      : [];

    const items = [];
    let idCounter = 0;
    for (const pv of pendingValues) {
      if (!pv || typeof pv.value !== "string") {
        continue;
      }

      items.push({
        type: pv.types && pv.types[0] ? pv.types[0] : "text",
        id: `sys_${idCounter++}`,
        value: pv.value,
        cacheKey: panel.getCacheKey(
          pv.value,
          pv.types && pv.types[0] ? pv.types[0] : "text",
        ),
      });
    }

    const metaByCacheKey = new Map(
      pendingValues
        .filter((pv) => pv && typeof pv.value === "string")
        .map((pv) => [
          panel.getCacheKey(
            pv.value,
            pv.types && pv.types[0] ? pv.types[0] : "text",
          ),
          pv,
        ]),
    );

    return [
      {
        strategy: {
          getTranslationPhaseLabel() {
            return "translating arrays";
          },
          collectUntranslated() {
            return items;
          },
          async setData({ panel: panelRef, successes }) {
            for (const success of successes || []) {
              if (!success || !success.cacheKey) {
                continue;
              }

              const meta = metaByCacheKey.get(success.cacheKey);
              const types = meta && Array.isArray(meta.types) ? meta.types : [];
              for (const type of types) {
                panelRef.setCacheValue(
                  panelRef.getCacheKey(success.value, type),
                  success.translated,
                );
              }
            }
          },
          finalizePhase: () => {
            this.applyCachedTranslationsToArrays(panel, arrays);
          },
        },
        priorityMapId: 0,
      },
    ];
  }

  countAmountSync({ panel }) {
    if (typeof panel.countGameArraysStats === "function") {
      return panel.countGameArraysStats();
    }
    return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
  }
}
