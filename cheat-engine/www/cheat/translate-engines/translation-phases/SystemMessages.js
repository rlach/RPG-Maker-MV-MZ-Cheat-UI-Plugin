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

    const source =
      $dataSystem.terms.messagesOriginal || $dataSystem.terms.messages;
    const keys = Object.keys(source || {});
    let total = 0;
    let left = 0;
    for (const key of keys) {
      const value = source[key];
      if (typeof value !== "string" || value.trim() === "") {
        continue;
      }

      total += 1;
      if (!panel.hasUsableCacheValue(key)) {
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

    const hasMessagesOriginal = !!$dataSystem.terms.messagesOriginal;
    const sourceMessages = hasMessagesOriginal
      ? $dataSystem.terms.messagesOriginal
      : $dataSystem.terms.messages;
    if (!hasMessagesOriginal) {
      $dataSystem.terms.messagesOriginal = Object.assign(
        {},
        $dataSystem.terms.messages || {},
      );
    }

    const pending = [];
    for (const key of Object.keys(sourceMessages || {})) {
      const value = sourceMessages[key];
      if (typeof value !== "string" || value.trim() === "") {
        continue;
      }

      if (!panel.hasUsableCacheValue(key)) {
        pending.push({
          type: "system_message",
          id: `msg_${key}`,
          value,
          cacheKey: key,
        });
      }
    }

    return pending;
  }

  setData({ panel, successes, failures }) {
    super.setData({ panel, successes, failures });

    for (const success of successes || []) {
      if (!success || !success.cacheKey) {
        continue;
      }

      if (
        $dataSystem.terms.messages &&
        Object.prototype.hasOwnProperty.call(
          $dataSystem.terms.messages,
          success.cacheKey,
        )
      ) {
        $dataSystem.terms.messages[success.cacheKey] = success.translated;
      }
    }
  }
}
