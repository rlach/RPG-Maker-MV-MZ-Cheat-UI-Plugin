import { BasePluginTranslator } from "../BasePluginTranslator.js";

export class DTextPictureTranslator extends BasePluginTranslator {
  constructor() {
    super();
    this._scanPrepared = false;
    this._scanEntries = [];
    this._scanPromise = null;
  }

  getPluginName() {
    return "DTextPicture";
  }

  getPluginLabel() {
    return "DTextPicture";
  }

  getCacheType() {
    return "plugin_dtext";
  }

  enablePluginTranslation() {
    if (window.__CHEAT_DTEXT_PICTURE_TRANSLATOR_HOOKED__) {
      return;
    }

    if (
      !window.Game_Screen ||
      !Game_Screen.prototype ||
      typeof Game_Screen.prototype.setDTextPicture !== "function"
    ) {
      return;
    }

    const original = Game_Screen.prototype.setDTextPicture;
    Game_Screen.prototype.setDTextPicture = function (value, size) {
      try {
        const runtime =
          typeof window.__ensureTranslationRuntime === "function"
            ? window.__ensureTranslationRuntime()
            : window.__TranslationRuntime || null;

        if (
          runtime &&
          typeof value === "string" &&
          value.trim() &&
          typeof runtime.getCacheKey === "function" &&
          typeof runtime.hasUsableCacheValue === "function" &&
          runtime.translationCache instanceof Map
        ) {
          const cacheKey = runtime.getCacheKey(value, "plugin_dtext");
          if (runtime.hasUsableCacheValue(cacheKey)) {
            const cached = runtime.translationCache.get(cacheKey);
            if (typeof cached === "string" && cached.trim()) {
              arguments[0] = cached;
            }
          }
        }
      } catch (error) {
        console.warn(
          "[DTextPictureTranslator] Failed to apply cached dynamic text translation",
          error,
        );
      }

      return original.apply(this, arguments);
    };

    window.__CHEAT_DTEXT_PICTURE_TRANSLATOR_HOOKED__ = true;
  }

  async prepareTranslator() {
    if (!this.ensureDetection()) {
      return;
    }

    if (this._scanPrepared) {
      return;
    }

    if (this._scanPromise) {
      return this._scanPromise;
    }

    this._scanPromise = this.buildScanEntries()
      .then((entries) => {
        this._scanEntries = Array.isArray(entries) ? entries : [];
        this._scanPrepared = true;
      })
      .catch((error) => {
        console.warn("[DTextPictureTranslator] Scan failed", error);
      })
      .finally(() => {
        this._scanPromise = null;
      });

    return this._scanPromise;
  }

  async buildScanEntries() {
    const entries = [];

    if (Array.isArray(window.$dataCommonEvents)) {
      for (let commonEventId = 0; commonEventId < $dataCommonEvents.length; commonEventId++) {
        const commonEvent = $dataCommonEvents[commonEventId];
        if (!commonEvent || !Array.isArray(commonEvent.list)) {
          continue;
        }

        this.collectDTextCommandsFromList(commonEvent.list, {
          scope: "commonEvent",
          commonEventId,
        }, entries);
      }
    }

    const mapInfos = Array.isArray(window.$dataMapInfos) ? window.$dataMapInfos : [];
    for (const mapInfo of mapInfos) {
      const mapId = Number(mapInfo && mapInfo.id);
      if (!mapId) {
        continue;
      }

      try {
        const mapData = await this.loadMapDataById(mapId);
        if (!mapData || !Array.isArray(mapData.events)) {
          continue;
        }

        for (let eventIdx = 0; eventIdx < mapData.events.length; eventIdx++) {
          const event = mapData.events[eventIdx];
          if (!event || !Array.isArray(event.pages)) {
            continue;
          }

          for (let pageIdx = 0; pageIdx < event.pages.length; pageIdx++) {
            const page = event.pages[pageIdx];
            if (!page || !Array.isArray(page.list)) {
              continue;
            }

            this.collectDTextCommandsFromList(page.list, {
              scope: "mapEvent",
              mapId,
              eventIdx,
              pageIdx,
            }, entries);
          }
        }
      } catch (error) {
        console.warn(
          `[DTextPictureTranslator] Failed to scan map ${mapId} for DTextPicture commands`,
          error,
        );
      }
    }

    return entries;
  }

  collectDTextCommandsFromList(list, baseMeta, output) {
    if (!Array.isArray(list) || !Array.isArray(output)) {
      return;
    }

    for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
      const cmd = list[cmdIdx];
      if (!cmd || Number(cmd.code) !== 357) {
        continue;
      }

      const parameters = Array.isArray(cmd.parameters) ? cmd.parameters : [];
      const pluginName = String(parameters[0] || "").trim();
      const commandName = String(parameters[1] || "").trim();
      const args = parameters[3] && typeof parameters[3] === "object" ? parameters[3] : null;
      const text = args && typeof args.text === "string" ? args.text : "";

      if (!pluginName || pluginName.toLowerCase() !== "dtextpicture") {
        continue;
      }

      if (commandName !== "dText") {
        continue;
      }

      if (!text || !text.trim()) {
        continue;
      }

      output.push({
        text,
        commandName,
        source: {
          ...baseMeta,
          cmdIdx,
        },
      });
    }
  }

  loadMapDataById(mapId) {
    return new Promise((resolve, reject) => {
      const safeMapId = Number(mapId) || 0;
      if (safeMapId <= 0) {
        reject(new Error("Invalid map id"));
        return;
      }

      const filename = `Map${String(safeMapId).padStart(3, "0")}.json`;
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `data/${filename}`, true);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (error) {
            reject(error);
          }
          return;
        }

        reject(new Error(`HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send();
    });
  }

  buildUniquePendingItems(panel) {
    const byCacheKey = new Map();

    for (const entry of this._scanEntries) {
      const text = typeof entry.text === "string" ? entry.text : "";
      if (!text || !text.trim()) {
        continue;
      }

      const cacheKey = panel.getCacheKey(text, this.getCacheType());
      if (!byCacheKey.has(cacheKey)) {
        byCacheKey.set(cacheKey, {
          type: this.getCacheType(),
          id: `plugin_dtext_${byCacheKey.size}`,
          value: text,
          cacheKey,
        });
      }
    }

    return Array.from(byCacheKey.values());
  }

  collectUntranslated({ panel }) {
    if (!panel || typeof panel.getCacheKey !== "function") {
      return [];
    }

    const items = this.buildUniquePendingItems(panel);
    return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
  }

  countPluginAmountSync({ panel }) {
    if (!panel || typeof panel.getCacheKey !== "function") {
      return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    const items = this.buildUniquePendingItems(panel);
    const totalStrings = items.length;
    const leftStrings = items.filter(
      (item) => !panel.hasUsableCacheValue(item.cacheKey),
    ).length;

    return {
      total: totalStrings,
      left: leftStrings,
      totalStrings,
      leftStrings,
    };
  }
}
