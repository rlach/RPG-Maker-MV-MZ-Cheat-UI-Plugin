import { TRANSLATE_SETTINGS, TRANSLATOR } from "../../js/TranslateHelper.js";

export const objectTranslationRuntimeMethods = {
  getObjectTranslationTypeDefs() {
    return [
      {
        id: "items",
        label: "items",
        kind: "data",
        getContainer: () => window.$dataItems,
        fields: ["name", "description", "note"],
        cachePrefix: "item",
      },
      {
        id: "skills",
        label: "skills",
        kind: "data",
        getContainer: () => window.$dataSkills,
        fields: ["name", "description", "message1", "message2"],
        cachePrefix: "skill",
      },
      {
        id: "classes",
        label: "classes",
        kind: "data",
        getContainer: () => window.$dataClasses,
        fields: ["name"],
        cachePrefix: "class",
      },
      {
        id: "enemies",
        label: "enemies",
        kind: "data",
        getContainer: () => window.$dataEnemies,
        fields: ["name"],
        cachePrefix: "enemy",
      },
      {
        id: "armors",
        label: "armors",
        kind: "data",
        getContainer: () => window.$dataArmors,
        fields: ["name", "description"],
        cachePrefix: "armor",
      },
      {
        id: "weapons",
        label: "weapons",
        kind: "data",
        getContainer: () => window.$dataWeapons,
        fields: ["name", "description"],
        cachePrefix: "weapon",
      },
      {
        id: "maps",
        label: "maps",
        kind: "data",
        getContainer: () => window.$dataMapInfos,
        fields: ["name"],
        cachePrefix: "map",
      },
      {
        id: "actors",
        label: "actors",
        kind: "data",
        getContainer: () => window.$dataActors,
        fields: ["name", "nickname", "profile"],
        cachePrefix: "actor",
      },
      {
        id: "systemMessages",
        label: "system messages",
        kind: "systemMessages",
      },
      {
        id: "systemCommands",
        label: "system commands",
        kind: "systemCommands",
      },
      {
        id: "gameArrays",
        label: "game arrays (terms, types, elements)",
        kind: "gameArrays",
      },
      {
        id: "commonEvents",
        label: "CommonEvents",
        kind: "commonEvents",
      },
      {
        id: "mapEvents",
        label: "Map events",
        kind: "mapEvents",
      },
    ];
  },

  getValidMapInfos() {
    if (!window.$dataMapInfos || !Array.isArray($dataMapInfos)) {
      return [];
    }

    const validMaps = [];
    for (let i = 0; i < $dataMapInfos.length; i++) {
      const mapInfo = $dataMapInfos[i];
      if (mapInfo && mapInfo.id) {
        validMaps.push({
          id: mapInfo.id,
          name: mapInfo.name || `Map ${mapInfo.id}`,
        });
      }
    }

    return validMaps;
  },

  countCommonEventsStats() {
    if (!Array.isArray(window.$dataCommonEvents)) {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    let total = 0;
    let left = 0;

    for (const entry of $dataCommonEvents) {
      if (!entry || !Array.isArray(entry.list)) {
        continue;
      }

      for (let i = 0; i < entry.list.length; i++) {
        const cmd = entry.list[i];
        if (!cmd || typeof cmd.code !== "number") {
          continue;
        }

        if (cmd.code === 101) {
          const speaker = (cmd.parameters && cmd.parameters[4]) || "";
          const speakerKey = speaker
            ? this.getCacheKey(speaker, "speaker")
            : null;
          if (speakerKey) {
            total++;
            if (!this.hasUsableCacheValue(speakerKey)) {
              left++;
            }
          }

          let j = i + 1;
          const lines = [];
          while (
            j < entry.list.length &&
            entry.list[j] &&
            entry.list[j].code === 401
          ) {
            lines.push(entry.list[j].parameters && entry.list[j].parameters[0]);
            j += 1;
          }

          const joined = lines.join("\n");
          if (joined && joined.trim()) {
            total++;
            if (!this.hasUsableCacheValue(this.getCacheKey(joined, "text"))) {
              left++;
            }
          }

          i = j - 1;
          continue;
        }

        if (cmd.code === 102) {
          const choices = cmd.parameters && cmd.parameters[0];
          if (Array.isArray(choices)) {
            for (const choice of choices) {
              if (
                !choice ||
                typeof choice !== "string" ||
                choice.trim() === ""
              ) {
                continue;
              }
              total++;
              if (
                !this.hasUsableCacheValue(this.getCacheKey(choice, "choice"))
              ) {
                left++;
              }
            }
          }
        }
      }
    }

    return { total, left, totalStrings: total, leftStrings: left };
  },

  countMapEventsStats() {
    const validMaps = this.getValidMapInfos();
    const totalMaps = validMaps.length;
    return {
      total: totalMaps,
      left: totalMaps,
      totalStrings: 0,
      leftStrings: 0,
    };
  },

  countEventCommandListStats(list = []) {
    if (!Array.isArray(list)) {
      return { totalStrings: 0, leftStrings: 0 };
    }

    let totalStrings = 0;
    let leftStrings = 0;

    for (let i = 0; i < list.length; i++) {
      const cmd = list[i];
      if (!cmd || typeof cmd.code !== "number") {
        continue;
      }

      if (cmd.code === 101) {
        const speaker = (cmd.parameters && cmd.parameters[4]) || "";
        if (speaker && speaker.trim()) {
          totalStrings += 1;
          if (!this.hasUsableCacheValue(this.getCacheKey(speaker, "speaker"))) {
            leftStrings += 1;
          }
        }

        let j = i + 1;
        const lines = [];
        while (j < list.length && list[j] && list[j].code === 401) {
          lines.push(list[j].parameters && list[j].parameters[0]);
          j += 1;
        }

        const text = lines.join("\n");
        if (text && text.trim()) {
          totalStrings += 1;
          if (!this.hasUsableCacheValue(this.getCacheKey(text, "text"))) {
            leftStrings += 1;
          }
        }

        i = j - 1;
        continue;
      }

      if (cmd.code === 102) {
        const choices = cmd.parameters && cmd.parameters[0];
        if (!Array.isArray(choices)) {
          continue;
        }

        for (const choice of choices) {
          if (!choice || typeof choice !== "string" || choice.trim() === "") {
            continue;
          }

          totalStrings += 1;
          if (!this.hasUsableCacheValue(this.getCacheKey(choice, "choice"))) {
            leftStrings += 1;
          }
        }
      }
    }

    return { totalStrings, leftStrings };
  },

  countMapEventStatsForData(mapData) {
    if (!mapData || !Array.isArray(mapData.events)) {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    let totalStrings = 0;
    let leftStrings = 0;

    for (const event of mapData.events) {
      if (!event || !Array.isArray(event.pages)) {
        continue;
      }

      for (const page of event.pages) {
        if (!page || !Array.isArray(page.list)) {
          continue;
        }

        const stats = this.countEventCommandListStats(page.list);
        totalStrings += stats.totalStrings;
        leftStrings += stats.leftStrings;
      }
    }

    return {
      total: totalStrings > 0 ? 1 : 0,
      left: leftStrings > 0 ? 1 : 0,
      totalStrings,
      leftStrings,
    };
  },

  getSelectedObjectTranslationMapIds(validMaps = null) {
    const safeMaps = Array.isArray(validMaps)
      ? validMaps
      : this.getValidMapInfos();
    const validIds = safeMaps
      .map((mapInfo) => Number(mapInfo.id))
      .filter(Boolean);

    if (!Array.isArray(this.objectTranslationSelectedMapIds)) {
      this.objectTranslationSelectedMapIds = validIds.slice();
    }

    const selectedSet = new Set(
      (this.objectTranslationSelectedMapIds || [])
        .map((id) => Number(id))
        .filter(Boolean),
    );
    const sanitizedIds = validIds.filter((id) => selectedSet.has(id));
    this.objectTranslationSelectedMapIds = sanitizedIds;
    return sanitizedIds.slice();
  },

  getObjectTranslationMapEventsMetaText(totalMaps, selectedMapCount) {
    const safeTotal = Math.max(0, Number(totalMaps) || 0);
    const safeSelected = Math.max(0, Number(selectedMapCount) || 0);

    if (safeSelected > 0 && safeSelected < safeTotal) {
      return `${safeSelected} of ${safeTotal} maps`;
    }

    return `${safeTotal} maps`;
  },

  async getTranslatedMapNames(validMaps) {
    const safeMaps = Array.isArray(validMaps) ? validMaps : [];
    const rawNames = safeMaps.map(
      (mapInfo) => mapInfo.name || `Map ${mapInfo.id}`,
    );
    let displayNames = rawNames.slice();

    if (TRANSLATE_SETTINGS.isMapTranslateEnabled()) {
      try {
        displayNames = await TRANSLATOR.translateBulk(rawNames);
      } catch (error) {
        console.warn(
          "[TranslateOnTheFly] Failed to translate map names for object modal:",
          error,
        );
      }
    }

    const lookup = new Map();
    for (let i = 0; i < safeMaps.length; i++) {
      const mapInfo = safeMaps[i];
      lookup.set(
        mapInfo.id,
        displayNames[i] || mapInfo.name || `Map ${mapInfo.id}`,
      );
    }

    return lookup;
  },

  async buildObjectTranslationMapEventDetails() {
    const validMaps = this.getValidMapInfos();
    const selectedMapIds = new Set(
      this.getSelectedObjectTranslationMapIds(validMaps),
    );
    const mapNames = await this.getTranslatedMapNames(validMaps);
    const details = [];

    for (const mapInfo of validMaps) {
      let stats = { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };

      try {
        const mapData = await this.loadMapDataById(mapInfo.id);
        stats = this.countMapEventStatsForData(mapData);
      } catch (error) {
        console.error(
          `[TranslateOnTheFly] Failed to build map event stats for map ${mapInfo.id}:`,
          error,
        );
      }

      details.push({
        id: mapInfo.id,
        label: mapNames.get(mapInfo.id) || mapInfo.name || `Map ${mapInfo.id}`,
        total: 1,
        left: stats.left,
        totalStrings: stats.totalStrings,
        leftStrings: stats.leftStrings,
        selected: selectedMapIds.has(mapInfo.id),
      });
    }

    return details;
  },

  loadMapDataById(mapId) {
    return new Promise((resolve, reject) => {
      const filename = "Map%1.json".format(mapId.padZero(3));
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `data/${filename}`, true);
      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        } else {
          reject(new Error(`Failed to load file: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send();
    });
  },

  getObjectTranslationStats() {
    const defs = this.getObjectTranslationTypeDefs();
    return defs.map((def) => {
      if (def.kind === "commonEvents") {
        const stats = this.countCommonEventsStats();
        return { ...def, ...stats };
      }

      if (def.kind === "mapEvents") {
        const stats = this.countMapEventsStats();
        return { ...def, ...stats };
      }

      if (def.kind === "systemMessages") {
        const stats = this.countSystemMessagesStats();
        return { ...def, ...stats };
      }

      if (def.kind === "systemCommands") {
        const stats = this.countSystemCommandsStats();
        return { ...def, ...stats };
      }

      if (def.kind === "gameArrays") {
        const stats = this.countGameArraysStats();
        return { ...def, ...stats };
      }

      const container = def.getContainer && def.getContainer();
      if (!Array.isArray(container)) {
        return { ...def, total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
      }

      let total = 0;
      let left = 0;
      let totalStrings = 0;
      let leftStrings = 0;

      for (let i = 1; i < container.length; i++) {
        const item = container[i];
        if (!item) continue;
        total++;

        if (!item._translateOriginal) {
          item._translateOriginal = {};
        }

        for (const field of def.fields) {
          if (!item._translateOriginal[field] && item[field]) {
            item._translateOriginal[field] = item[field];
          }
        }

        let hasUntranslated = false;
        for (const field of def.fields) {
          const originalValue = item._translateOriginal[field];
          if (
            !originalValue ||
            typeof originalValue !== "string" ||
            originalValue.trim() === ""
          ) {
            continue;
          }

          totalStrings++;
          const cacheKey = this.getCacheKey(
            originalValue,
            `${def.cachePrefix}_${field}`,
          );
          if (!this.hasUsableCacheValue(cacheKey)) {
            leftStrings++;
            hasUntranslated = true;
          }
        }

        if (hasUntranslated) {
          left++;
        }
      }

      return { ...def, total, left, totalStrings, leftStrings };
    });
  },

  countSystemCommandsStats() {
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
      if (!val || typeof val !== "string" || val.trim() === "") continue;
      total++;
      const cacheKey = this.getCacheKey(val, "command");
      if (!this.hasUsableCacheValue(cacheKey)) {
        left++;
      }
    }

    return { total, left, totalStrings: total, leftStrings: left };
  },

  countSystemMessagesStats() {
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
      total++;
      if (!this.hasUsableCacheValue(key)) {
        left++;
      }
    }

    return {
      total,
      left,
      totalStrings: total,
      leftStrings: left,
    };
  },

  getGameArrayDefs() {
    return [
      {
        parent: () => ($dataSystem && $dataSystem.terms) || null,
        prop: "basic",
        type: "terms_basic",
      },
      {
        parent: () => ($dataSystem && $dataSystem.terms) || null,
        prop: "params",
        type: "terms_params",
      },
      {
        parent: () => ($dataSystem && $dataSystem.terms) || null,
        prop: "commands",
        type: "command",
      },
      {
        parent: () => $dataSystem || null,
        prop: "weaponTypes",
        type: "weaponType",
      },
      {
        parent: () => $dataSystem || null,
        prop: "variables",
        type: "variable",
      },
      { parent: () => $dataSystem || null, prop: "switches", type: "switch" },
      {
        parent: () => $dataSystem || null,
        prop: "skillTypes",
        type: "skillType",
      },
      {
        parent: () => $dataSystem || null,
        prop: "equipTypes",
        type: "equipType",
      },
      {
        parent: () => $dataSystem || null,
        prop: "elements",
        type: "element",
      },
      {
        parent: () => $dataSystem || null,
        prop: "armorTypes",
        type: "armorType",
      },
    ];
  },

  collectGameArrayCandidates() {
    if (!window.$dataSystem) {
      return { uniqueValues: [], pendingValues: [] };
    }

    const arrays = this.getGameArrayDefs();
    const uniqueValuesMap = new Map();

    for (const entry of arrays) {
      const parentObj = entry.parent();
      if (!parentObj) {
        continue;
      }

      const sourceArr = Array.isArray(parentObj[`${entry.prop}Original`])
        ? parentObj[`${entry.prop}Original`]
        : parentObj[entry.prop];
      if (!Array.isArray(sourceArr)) {
        continue;
      }

      for (const value of sourceArr) {
        if (!value || typeof value !== "string") {
          continue;
        }

        const trimmed = value.trim();
        if (!trimmed) {
          continue;
        }

        if (!uniqueValuesMap.has(trimmed)) {
          uniqueValuesMap.set(trimmed, {
            value: trimmed,
            types: new Set(),
            cacheKeys: new Set(),
          });
        }

        const candidate = uniqueValuesMap.get(trimmed);
        candidate.types.add(entry.type);
        candidate.cacheKeys.add(this.getCacheKey(trimmed, entry.type));
      }
    }

    const uniqueValues = Array.from(uniqueValuesMap.values()).map(
      (candidate) => ({
        value: candidate.value,
        types: Array.from(candidate.types),
        cacheKeys: Array.from(candidate.cacheKeys),
      }),
    );

    const pendingValues = uniqueValues.filter((candidate) => {
      return !candidate.cacheKeys.some((cacheKey) =>
        this.hasUsableCacheValue(cacheKey),
      );
    });

    return { uniqueValues, pendingValues };
  },

  countGameArraysStats() {
    if (!window.$dataSystem) {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    const candidates = this.collectGameArrayCandidates();
    const total = candidates.uniqueValues.length;
    const left = candidates.pendingValues.length;

    return { total, left, totalStrings: total, leftStrings: left };
  },
};
