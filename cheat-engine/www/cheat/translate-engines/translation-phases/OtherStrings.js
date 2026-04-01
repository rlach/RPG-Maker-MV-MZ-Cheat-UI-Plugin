import { BasePhase } from "./BasePhase.js";

export class OtherStrings extends BasePhase {
  static getInstance() {
    if (!OtherStrings._instance) {
      OtherStrings._instance = new OtherStrings();
    }
    return OtherStrings._instance;
  }

  getTranslationPhaseLabel() {
    return "translating other strings";
  }

  getKind() {
    return "otherStrings";
  }

  getTitleOriginalValue() {
    if (!window.$dataSystem || typeof $dataSystem.gameTitle !== "string") {
      return "";
    }

    if (typeof $dataSystem._translationOriginalGameTitle !== "string") {
      $dataSystem._translationOriginalGameTitle = $dataSystem.gameTitle || "";
    }

    return $dataSystem._translationOriginalGameTitle || "";
  }

  getTitleCacheKey(panel) {
    const source = this.getTitleOriginalValue();
    if (!panel || typeof panel.getCacheKey !== "function") {
      return null;
    }

    if (!source || source.trim() === "") {
      return null;
    }

    return panel.getCacheKey(source, "other");
  }

  async createEntries() {
    return [
      {
        strategy: this,
        priorityMapId: 0,
      },
    ];
  }

  countAmountSync({ panel }) {
    const source = this.getTitleOriginalValue();
    if (!source || source.trim() === "") {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    const cacheKey = this.getTitleCacheKey(panel);
    const hasTranslated = !!(
      cacheKey && panel && panel.hasUsableCacheValue(cacheKey)
    );

    return {
      total: 1,
      left: hasTranslated ? 0 : 1,
      totalStrings: 1,
      leftStrings: hasTranslated ? 0 : 1,
    };
  }

  collectUntranslated({ panel }) {
    const source = this.getTitleOriginalValue();
    if (!source || source.trim() === "") {
      return [];
    }

    const cacheKey = this.getTitleCacheKey(panel);
    if (cacheKey && panel.hasUsableCacheValue(cacheKey)) {
      return [];
    }

    return [
      {
        type: "other",
        id: "other_gameTitle",
        value: source,
        cacheKey,
      },
    ];
  }

  setData({ panel, successes, failures }) {
    super.setData({ panel, successes, failures });
    if (!window.$dataSystem) {
      return;
    }

    const cacheKey = this.getTitleCacheKey(panel);
    if (!cacheKey) {
      return;
    }

    const success = (successes || []).find((item) => item.cacheKey === cacheKey);
    if (success && typeof success.translated === "string") {
      $dataSystem.gameTitle = success.translated;
    }
  }

  applyDataOnLifecycle({ panel } = {}) {
    if (!panel || !window.$dataSystem) {
      return true;
    }

    const cacheKey = this.getTitleCacheKey(panel);
    if (!cacheKey || !panel.hasUsableCacheValue(cacheKey)) {
      return true;
    }

    const translated = panel.translationCache.get(cacheKey);
    if (typeof translated === "string") {
      $dataSystem.gameTitle = translated;
    }

    return true;
  }
}