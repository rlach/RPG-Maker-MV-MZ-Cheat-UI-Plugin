import { BasePhase } from "./BasePhase.js";

export class Troops extends BasePhase {
  static getInstance() {
    if (!Troops._instance) {
      Troops._instance = new Troops();
    }
    return Troops._instance;
  }

  getTranslationPhaseLabel() {
    return "translating troops";
  }

  getKind() {
    return "troops";
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
    if (!Array.isArray(window.$dataTroops)) {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    let totalStrings = 0;
    let leftStrings = 0;

    for (const troop of $dataTroops) {
      if (!troop || !Array.isArray(troop.pages)) {
        continue;
      }

      for (const page of troop.pages) {
        if (!page || !Array.isArray(page.list)) {
          continue;
        }

        const list = page.list;
        let i = 0;
        while (i < list.length) {
          const cmd = list[i];
          if (!cmd || typeof cmd.code !== "number") {
            i += 1;
            continue;
          }

          if (cmd.code === 101) {
            const speaker = (cmd.parameters && cmd.parameters[4]) || "";
            if (speaker && speaker.trim()) {
              totalStrings += 1;
              if (!panel.hasUsableCacheValue(panel.getCacheKey(speaker, "troop"))) {
                leftStrings += 1;
              }
            }

            const lines = [];
            let j = i + 1;
            while (j < list.length && list[j] && list[j].code === 401) {
              lines.push(list[j].parameters && list[j].parameters[0]);
              j += 1;
            }

            const text = lines.join("\n");
            if (text && text.trim()) {
              totalStrings += 1;
              if (!panel.hasUsableCacheValue(panel.getCacheKey(text, "troop"))) {
                leftStrings += 1;
              }
            }

            i = j;
            continue;
          }

          if (cmd.code === 102) {
            const choices = cmd.parameters && cmd.parameters[0];
            if (Array.isArray(choices)) {
              for (const choice of choices) {
                if (!choice || typeof choice !== "string" || choice.trim() === "") {
                  continue;
                }

                totalStrings += 1;
                if (!panel.hasUsableCacheValue(panel.getCacheKey(choice, "troop"))) {
                  leftStrings += 1;
                }
              }
            }
          }

          i += 1;
        }
      }
    }

    return {
      total: totalStrings,
      left: leftStrings,
      totalStrings,
      leftStrings,
    };
  }

  collectUntranslated({ panel }) {
    if (!Array.isArray(window.$dataTroops)) {
      return [];
    }

    const itemsByCacheKey = new Map();
    let runningCounter = 0;

    const pushTroopItem = (
      rawText,
      originalType,
      troopIdx,
      pageIdx,
      cmdIdx,
    ) => {
      if (typeof rawText !== "string" || rawText.trim() === "") {
        return;
      }

      const cacheKey = panel.getCacheKey(rawText, "troop");
      if (panel.hasUsableCacheValue(cacheKey)) {
        return;
      }

      const existing = itemsByCacheKey.get(cacheKey);
      if (existing) {
        if (!existing.originalTypes.includes(originalType)) {
          existing.originalTypes.push(originalType);
        }
        return;
      }

      itemsByCacheKey.set(cacheKey, {
        type: "troop",
        id: `troop_${troopIdx}_${pageIdx}_${originalType}_${runningCounter++}`,
        value: rawText,
        cacheKey,
        originalTypes: [originalType],
        troopIdx,
        pageIdx,
        cmdIdx,
      });
    };

    for (let troopIdx = 0; troopIdx < $dataTroops.length; troopIdx++) {
      const troop = $dataTroops[troopIdx];
      if (!troop || !Array.isArray(troop.pages)) {
        continue;
      }

      for (let pageIdx = 0; pageIdx < troop.pages.length; pageIdx++) {
        const page = troop.pages[pageIdx];
        if (!page || !Array.isArray(page.list)) {
          continue;
        }

        const list = page.list;
        let i = 0;
        while (i < list.length) {
          const cmd = list[i];
          if (!cmd || typeof cmd.code !== "number") {
            i += 1;
            continue;
          }

          if (cmd.code === 101) {
            const speaker = (cmd.parameters && cmd.parameters[4]) || "";
            if (speaker && speaker.trim()) {
              pushTroopItem(speaker, "speaker", troopIdx, pageIdx, i);
            }

            const lines = [];
            let j = i + 1;
            while (j < list.length && list[j] && list[j].code === 401) {
              lines.push(list[j].parameters && list[j].parameters[0]);
              j += 1;
            }

            pushTroopItem(lines.join("\n"), "text", troopIdx, pageIdx, i);
            i = j;
            continue;
          }

          if (cmd.code === 102) {
            const choices = cmd.parameters && cmd.parameters[0];
            if (Array.isArray(choices)) {
              for (const choice of choices) {
                pushTroopItem(choice, "choice", troopIdx, pageIdx, i);
              }
            }
          }

          i += 1;
        }
      }
    }

    return Array.from(itemsByCacheKey.values());
  }

  setData({ panel, pendingItems, successes, failures }) {
    for (const success of successes || []) {
      if (!success || !success.cacheKey) {
        continue;
      }

      panel.setCacheValue(success.cacheKey, success.translated, {
        persist: false,
      });
    }

    panel.markBatchFailuresAsUntranslated(failures || [], true);

    const pendingByCacheKey = new Map(
      (pendingItems || [])
        .filter((entry) => entry && entry.cacheKey)
        .map((entry) => [entry.cacheKey, entry]),
    );

    for (const success of successes || []) {
      if (!success || !success.cacheKey) {
        continue;
      }

      const source = pendingByCacheKey.get(success.cacheKey);
      const originalTypes =
        source && Array.isArray(source.originalTypes)
          ? source.originalTypes
          : source && source.originalType
            ? [source.originalType]
            : [];
      const originalValue = source && source.value;
      if (originalTypes.length === 0 || !originalValue) {
        continue;
      }

      for (const originalType of originalTypes) {
        panel.setCacheValue(
          panel.getCacheKey(originalValue, originalType),
          success.translated,
          { persist: false },
        );

        if (originalType === "speaker") {
          const legacySpeakerKey = panel.getLegacySpeakerCacheKey(originalValue);
          if (legacySpeakerKey) {
            panel.setCacheValue(legacySpeakerKey, success.translated, {
              persist: false,
            });
          }
        }
      }
    }

    panel.persistCache();
  }
}
