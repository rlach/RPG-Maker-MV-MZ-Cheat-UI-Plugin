import { parseCacheKeyForLangPair } from "../../js/TranslateCacheRuntime.js";
import { BasePhase } from "./BasePhase.js";

export class CacheEmptyStrings extends BasePhase {
  static getInstance() {
    if (!CacheEmptyStrings._instance) {
      CacheEmptyStrings._instance = new CacheEmptyStrings();
    }
    return CacheEmptyStrings._instance;
  }

  getKind() {
    return "cacheEmptyStrings";
  }

  getTranslationPhaseLabel() {
    return "translate empty strings";
  }

  collectUntranslated({ panel } = {}) {
    if (
      !panel ||
      !panel.translationCache ||
      !panel.sourceLang ||
      !panel.targetLang
    ) {
      return [];
    }

    const items = [];
    let idCounter = 0;

    for (const [cacheKey, value] of panel.translationCache.entries()) {
      const parsed = parseCacheKeyForLangPair(
        cacheKey,
        panel.sourceLang,
        panel.targetLang,
      );
      if (!parsed) {
        continue;
      }

      const currentValue = typeof value === "string" ? value : "";
      if (currentValue !== "") {
        continue;
      }

      const original =
        typeof parsed.original === "string" ? parsed.original.trim() : "";
      if (!original) {
        continue;
      }

      items.push({
        type: parsed.type,
        id: `cache_empty_${idCounter++}`,
        value: parsed.original,
        cacheKey,
      });
    }

    return items;
  }

  countAmountSync({ panel } = {}) {
    const items = this.collectUntranslated({ panel });
    const count = items.length;
    return {
      total: count,
      left: count,
      totalStrings: count,
      leftStrings: count,
    };
  }

  async createEntries({ request }) {
    const repeatUntilSuccess = !!request.repeatUntilSuccess;
    const self = this;

    return [
      {
        priorityMapId: 0,
        strategy: this,
        shouldRepeat(result, { panel }) {
          if (!repeatUntilSuccess) {
            return false;
          }
          if ((result.successes || []).length === 0) {
            return false;
          }
          return self.collectUntranslated({ panel }).length > 0;
        },
      },
    ];
  }
}
