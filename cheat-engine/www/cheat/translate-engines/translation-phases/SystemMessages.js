import { BasePhase } from "./BasePhase.js";

export class SystemMessages extends BasePhase {
  static getInstance() {
    if (!SystemMessages._instance) {
      SystemMessages._instance = new SystemMessages();
    }
    return SystemMessages._instance;
  }

  getTranslationPhaseLabel() {
    return "translating system messages";
  }

  getKind() {
    return "systemMessages";
  }

  getPrimaryCacheKey(panel, messageKey) {
    if (!panel || typeof panel.getCacheKey !== "function") {
      return null;
    }

    return panel.getCacheKey(messageKey, "system_message");
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
    if (
      !window.$dataSystem ||
      !$dataSystem.terms ||
      !$dataSystem.terms.messages ||
      typeof $dataSystem.terms.messages !== "object"
    ) {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    const messages = $dataSystem.terms.messages;
    const keys = Object.keys(messages || {});
    let total = 0;
    let left = 0;
    for (const key of keys) {
      const value = messages[key];
      if (typeof value !== "string" || value.trim() === "") {
        continue;
      }

      total += 1;
      const cacheKey = this.getPrimaryCacheKey(panel, key);
      if (!cacheKey || !panel.hasUsableCacheValue(cacheKey)) {
        left += 1;
      }
    }

    return { total, left, totalStrings: total, leftStrings: left };
  }

  collectUntranslated({ panel }) {
    if (
      !(
        window.$dataSystem &&
        $dataSystem.terms &&
        $dataSystem.terms.messages &&
        typeof $dataSystem.terms.messages === "object"
      )
    ) {
      return [];
    }

    const messages = $dataSystem.terms.messages;
    const pending = [];
    
    for (const key of Object.keys(messages || {})) {
      const value = messages[key];
      if (typeof value !== "string" || value.trim() === "") {
        continue;
      }

      const cacheKey = this.getPrimaryCacheKey(panel, key);
      if (!cacheKey || !panel.hasUsableCacheValue(cacheKey)) {
        pending.push({
          type: "system_message",
          id: `msg_${key}`,
          value,
          messageKey: key,
          cacheKey,
        });
      }
    }

    return pending;
  }

  setData({ panel, pendingItems, successes, failures }) {
    super.setData({ panel, successes, failures });

    if (
      !window.$dataSystem ||
      !$dataSystem.terms ||
      !$dataSystem.terms.messages ||
      typeof $dataSystem.terms.messages !== "object"
    ) {
      return;
    }

    const messageKeyByCacheKey = new Map(
      (pendingItems || [])
        .filter((entry) => entry && entry.cacheKey && entry.messageKey)
        .map((entry) => [entry.cacheKey, entry.messageKey]),
    );

    for (const success of successes || []) {
      if (!success || !success.cacheKey) {
        continue;
      }

      const messageKey = messageKeyByCacheKey.get(success.cacheKey);
      if (!messageKey) {
        continue;
      }

      if (
        $dataSystem.terms.messages &&
        Object.prototype.hasOwnProperty.call(
          $dataSystem.terms.messages,
          messageKey,
        )
      ) {
        $dataSystem.terms.messages[messageKey] = success.translated;
      }
    }
  }

  applyDataOnLifecycle({ panel } = {}) {
    if (
      !panel ||
      !window.$dataSystem ||
      !$dataSystem.terms ||
      !$dataSystem.terms.messages ||
      typeof $dataSystem.terms.messages !== "object"
    ) {
      return true;
    }

    const messages = $dataSystem.terms.messages;
    let applied = 0;

    for (const key of Object.keys(messages || {})) {
      const cacheKey = this.getPrimaryCacheKey(panel, key);
      if (!cacheKey || !panel.hasUsableCacheValue(cacheKey)) {
        continue;
      }

      const translated = panel.translationCache.get(cacheKey);
      if (translated !== undefined) {
        $dataSystem.terms.messages[key] = translated;
        applied += 1;
      }
    }

    if (applied > 0) {
      console.log(
        `[SystemMessages] Applied ${applied} cached system messages`,
      );
    }

    return true;
  }
}
