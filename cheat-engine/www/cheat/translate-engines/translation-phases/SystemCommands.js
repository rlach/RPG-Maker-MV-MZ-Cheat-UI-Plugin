import { BaseTranslationPhaseStrategy } from "./BasePhase.js";

export class SystemCommandsTranslationPhaseStrategy extends BaseTranslationPhaseStrategy {
  static getInstance() {
    if (!SystemCommandsTranslationPhaseStrategy._instance) {
      SystemCommandsTranslationPhaseStrategy._instance =
        new SystemCommandsTranslationPhaseStrategy();
    }
    return SystemCommandsTranslationPhaseStrategy._instance;
  }

  getTranslationPhaseLabel() {
    return "translating system commands";
  }

  getKind() {
    return "systemCommands";
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
      !Array.isArray($dataSystem.terms.commands)
    ) {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    const source =
      $dataSystem.terms.commandsOriginal || $dataSystem.terms.commands;
    let total = 0;
    let left = 0;
    for (const val of source) {
      if (!val || typeof val !== "string" || val.trim() === "") {
        continue;
      }

      total += 1;
      const cacheKey = panel.getCacheKey(val, "command");
      if (!panel.hasUsableCacheValue(cacheKey)) {
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
        Array.isArray($dataSystem.terms.commands)
      )
    ) {
      return [];
    }

    const hasCommandsOriginal = !!$dataSystem.terms.commandsOriginal;
    const sourceCommands = hasCommandsOriginal
      ? $dataSystem.terms.commandsOriginal
      : $dataSystem.terms.commands;
    if (!hasCommandsOriginal) {
      $dataSystem.terms.commandsOriginal = [...$dataSystem.terms.commands];
    }

    const pending = [];
    for (let i = 0; i < sourceCommands.length; i++) {
      const value = sourceCommands[i];
      if (!value || typeof value !== "string" || value.trim() === "") {
        continue;
      }

      const cacheKey = panel.getCacheKey(value, "command");
      if (!panel.hasUsableCacheValue(cacheKey)) {
        pending.push({
          type: "system_command",
          id: `cmd_${i}`,
          value,
          cacheKey,
          index: i,
        });
      }
    }

    return pending;
  }

  setData({ panel, successes, failures, pendingItems }) {
    super.setData({ panel, successes, failures });

    const pendingByCacheKey = new Map(
      (pendingItems || []).map((item) => [item.cacheKey, item]),
    );

    for (const success of successes || []) {
      if (!success || !success.cacheKey) {
        continue;
      }

      const origin = pendingByCacheKey.get(success.cacheKey);
      if (origin && $dataSystem.terms.commands[origin.index] !== undefined) {
        $dataSystem.terms.commands[origin.index] = success.translated;
      }
    }
  }
}
