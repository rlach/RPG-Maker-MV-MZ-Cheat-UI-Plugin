import { BaseTranslationPhaseStrategy } from "./BaseTranslationPhaseStrategy.js";

export class MapEventsTranslationPhaseStrategy extends BaseTranslationPhaseStrategy {
  static getInstance() {
    if (!MapEventsTranslationPhaseStrategy._instance) {
      MapEventsTranslationPhaseStrategy._instance =
        new MapEventsTranslationPhaseStrategy();
    }
    return MapEventsTranslationPhaseStrategy._instance;
  }

  constructor(
    mapData = null,
    mapNumber = null,
    totalMaps = null,
    progressLabel = null,
  ) {
    super();
    this.configure(mapData, mapNumber, totalMaps, progressLabel);
  }

  configure(
    mapData = null,
    mapNumber = null,
    totalMaps = null,
    progressLabel = null,
  ) {
    this.mapData = mapData;
    this.mapNumber = mapNumber;
    this.totalMaps = totalMaps;
    this.progressLabel = progressLabel;
    return this;
  }

  static countEventCommandListStats(panel, list = []) {
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
          if (
            !panel.hasUsableCacheValue(panel.getCacheKey(speaker, "speaker"))
          ) {
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
          if (!panel.hasUsableCacheValue(panel.getCacheKey(text, "text"))) {
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
          if (!panel.hasUsableCacheValue(panel.getCacheKey(choice, "choice"))) {
            leftStrings += 1;
          }
        }
      }
    }

    return { totalStrings, leftStrings };
  }

  static countMapEventStatsForData(panel, mapData) {
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

        const stats =
          MapEventsTranslationPhaseStrategy.countEventCommandListStats(
            panel,
            page.list,
          );
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
  }

  getTranslationPhaseLabel() {
    return (
      this.progressLabel ||
      (this.mapNumber !== null && this.totalMaps !== null
        ? `translating map ${this.mapNumber}/${this.totalMaps}`
        : "translating map")
    );
  }

  getKind() {
    return "mapEvents";
  }

  async createEntries({ request, panel }) {
    if (request.mapData) {
      return [
        {
          priorityMapId: Number(request.mapId) || 0,
          strategy: this.configure(
            request.mapData,
            request.mapNumber || null,
            request.totalMaps || null,
            request.progressLabel || "translating map",
          ),
        },
      ];
    }

    const validMaps = panel.getValidMapInfos();
    const selectedIds = Array.isArray(request.mapIds)
      ? request.mapIds.map((id) => Number(id)).filter(Boolean)
      : panel.getSelectedObjectTranslationMapIds(validMaps);
    const selectedIdSet = new Set(selectedIds);
    const mapsToTranslate = validMaps.filter((mapInfo) =>
      selectedIdSet.has(Number(mapInfo.id)),
    );

    return mapsToTranslate.map((mapInfo, mapIndex) => {
      const mapNumber = mapIndex + 1;
      const totalMaps = mapsToTranslate.length;
      return {
        priorityMapId: Number(mapInfo.id) || 0,
        createStrategy: async () => {
          const mapData = await panel.loadMapDataById(mapInfo.id);
          return this.configure(
            mapData,
            mapNumber,
            totalMaps,
            `translating map ${mapNumber}/${totalMaps}`,
          );
        },
      };
    });
  }

  countAmountSync({ request, panel }) {
    const validMaps = panel.getValidMapInfos();
    const selectedIds = Array.isArray(request.mapIds)
      ? request.mapIds.map((id) => Number(id)).filter(Boolean)
      : panel.getSelectedObjectTranslationMapIds(validMaps);
    const total = selectedIds.length;
    return { total, left: total, totalStrings: 0, leftStrings: 0 };
  }

  collectUntranslated({ panel }) {
    const dataMap = this.mapData || window.$dataMap;
    if (!dataMap || !Array.isArray(dataMap.events)) {
      return [];
    }

    const itemsToTranslate = [];
    let runningCounter = 0;

    const pushMapTextItem = (rawText, eventIdx, pageIdx, cmdIdx) => {
      if (typeof rawText !== "string" || rawText.trim() === "") {
        return;
      }

      const cacheKey = panel.getCacheKey(rawText, "text");
      if (panel.hasUsableCacheValue(cacheKey)) {
        return;
      }

      itemsToTranslate.push({
        type: "text",
        id: `map_${eventIdx}_${pageIdx}_text_${runningCounter++}`,
        value: rawText,
        cacheKey,
        eventIdx,
        pageIdx,
        cmdIdx,
      });
    };

    for (let eventIdx = 0; eventIdx < dataMap.events.length; eventIdx++) {
      const event = dataMap.events[eventIdx];
      if (!event || !Array.isArray(event.pages)) {
        continue;
      }

      for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
        const page = event.pages[pageIdx];
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
            const lines = [];
            let j = i + 1;
            while (j < list.length && list[j] && list[j].code === 401) {
              lines.push(list[j].parameters && list[j].parameters[0]);
              j += 1;
            }

            pushMapTextItem(lines.join("\n"), eventIdx, pageIdx, i);

            if (speaker) {
              const speakerKey = panel.getCacheKey(speaker, "speaker");
              if (!panel.hasUsableCacheValue(speakerKey)) {
                itemsToTranslate.push({
                  type: "speaker",
                  id: `map_${eventIdx}_${pageIdx}_speaker_${runningCounter++}`,
                  value: speaker,
                  cacheKey: speakerKey,
                  eventIdx,
                  pageIdx,
                  cmdIdx: i,
                });
              }
            }

            i = j;
            continue;
          }

          if (cmd.code === 102) {
            const choices = cmd.parameters && cmd.parameters[0];
            if (Array.isArray(choices)) {
              for (const choice of choices) {
                const choiceKey = panel.getCacheKey(choice, "choice");
                if (!panel.hasUsableCacheValue(choiceKey)) {
                  itemsToTranslate.push({
                    type: "choice",
                    id: `map_${eventIdx}_${pageIdx}_choice_${runningCounter++}`,
                    value: choice,
                    cacheKey: choiceKey,
                    eventIdx,
                    pageIdx,
                    cmdIdx: i,
                  });
                }
              }
            }
          }

          i += 1;
        }
      }
    }

    return Array.from(
      new Map(itemsToTranslate.map((item) => [item.cacheKey, item])).values(),
    );
  }
}
