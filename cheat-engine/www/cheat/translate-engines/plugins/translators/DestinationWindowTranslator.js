import { BasePluginTranslator } from "../BasePluginTranslator.js";

const DESTINATION_SET_COMMANDS = new Set([
  "DW_目標設定",
  "DW_SET_DESTINATION",
]);

const DESTINATION_SET_WITH_ICON_COMMANDS = new Set([
  "DW_アイコン付き目標設定",
  "DW_SET_DESTINATION_WITH_ICON",
]);

function toUpperSafe(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizePluginCommandText(args) {
  if (!Array.isArray(args)) {
    return "";
  }

  return args
    .reduce((previous, arg) => previous + " " + String(arg || ""), "")
    .replace(/^ /, "");
}

export class DestinationWindowTranslator extends BasePluginTranslator {
  constructor() {
    super();
    this._scanPrepared = false;
    this._scanEntries = [];
    this._scanPromise = null;
  }

  getPluginName() {
    return "DestinationWindow";
  }

  getPluginLabel() {
    return "DestinationWindow";
  }

  getCacheType() {
    return "plugin_destination_window";
  }

  isSetDestinationCommand(command) {
    const safeCommand = String(command || "").trim();
    const upper = toUpperSafe(safeCommand);
    return (
      DESTINATION_SET_COMMANDS.has(safeCommand) || upper === "DW_SET_DESTINATION"
    );
  }

  isSetDestinationWithIconCommand(command) {
    const safeCommand = String(command || "").trim();
    const upper = toUpperSafe(safeCommand);
    return (
      DESTINATION_SET_WITH_ICON_COMMANDS.has(safeCommand) ||
      upper === "DW_SET_DESTINATION_WITH_ICON"
    );
  }

  parseCommandLine(commandLine) {
    const line = String(commandLine || "");
    if (!line.trim()) {
      return null;
    }

    const parts = line.split(" ");
    const command = String(parts.shift() || "").trim();
    if (!command) {
      return null;
    }

    if (this.isSetDestinationCommand(command)) {
      const text = normalizePluginCommandText(parts);
      if (!text || !text.trim()) {
        return null;
      }

      return {
        command,
        text,
      };
    }

    if (this.isSetDestinationWithIconCommand(command)) {
      const icon = String(parts.shift() || "").trim();
      const text = normalizePluginCommandText(parts);
      if (!text || !text.trim()) {
        return null;
      }

      return {
        command,
        icon,
        text,
      };
    }

    return null;
  }

  buildTranslatedArgs(command, args, runtime) {
    if (!runtime || typeof runtime.getCacheKey !== "function") {
      return null;
    }

    if (typeof runtime.hasUsableCacheValue !== "function") {
      return null;
    }

    if (!(runtime.translationCache instanceof Map)) {
      return null;
    }

    const parsed = this.parseCommandLine(
      [String(command || ""), ...((Array.isArray(args) && args) || [])].join(" "),
    );
    if (!parsed || !parsed.text) {
      return null;
    }

    const cacheKey = runtime.getCacheKey(parsed.text, this.getCacheType());

    if (typeof runtime.markCacheKeySeen === "function") {
      runtime.markCacheKeySeen(cacheKey);
    }

    if (!runtime.hasUsableCacheValue(cacheKey)) {
      return null;
    }

    const cached = runtime.translationCache.get(cacheKey);
    if (typeof cached !== "string" || !cached.trim()) {
      return null;
    }

    if (this.isSetDestinationWithIconCommand(parsed.command)) {
      if (parsed.icon) {
        return [parsed.icon, cached];
      }
      return [cached];
    }

    return [cached];
  }

  enablePluginTranslation() {
    if (window.__CHEAT_DESTINATION_WINDOW_TRANSLATOR_HOOKED__) {
      return;
    }

    if (
      !window.Game_Interpreter ||
      !Game_Interpreter.prototype ||
      typeof Game_Interpreter.prototype.pluginCommand !== "function"
    ) {
      return;
    }

    const original = Game_Interpreter.prototype.pluginCommand;
    const translator = this;

    Game_Interpreter.prototype.pluginCommand = function(command, args) {
      try {
        const runtime =
          typeof window.__ensureTranslationRuntime === "function"
            ? window.__ensureTranslationRuntime()
            : window.__TranslationRuntime || null;

        const translatedArgs = translator.buildTranslatedArgs(command, args, runtime);
        if (Array.isArray(translatedArgs)) {
          arguments[1] = translatedArgs;
        }
      } catch (error) {
        console.warn(
          "[DestinationWindowTranslator] Failed to apply cached plugin command translation",
          error,
        );
      }

      return original.apply(this, arguments);
    };

    window.__CHEAT_DESTINATION_WINDOW_TRANSLATOR_HOOKED__ = true;
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
        console.warn("[DestinationWindowTranslator] Scan failed", error);
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

        this.collectDestinationCommandsFromList(commonEvent.list, {
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

            this.collectDestinationCommandsFromList(page.list, {
              scope: "mapEvent",
              mapId,
              eventIdx,
              pageIdx,
            }, entries);
          }
        }
      } catch (error) {
        console.warn(
          `[DestinationWindowTranslator] Failed to scan map ${mapId}`,
          error,
        );
      }
    }

    return entries;
  }

  collectDestinationCommandsFromList(list, baseMeta, output) {
    if (!Array.isArray(list) || !Array.isArray(output)) {
      return;
    }

    for (let cmdIdx = 0; cmdIdx < list.length; cmdIdx++) {
      const cmd = list[cmdIdx];
      if (!cmd || Number(cmd.code) !== 356) {
        continue;
      }

      const commandLine =
        Array.isArray(cmd.parameters) && typeof cmd.parameters[0] === "string"
          ? cmd.parameters[0]
          : "";

      const parsed = this.parseCommandLine(commandLine);
      if (!parsed || !parsed.text || !parsed.text.trim()) {
        continue;
      }

      output.push({
        text: parsed.text,
        command: parsed.command,
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
          id: `plugin_destination_window_${byCacheKey.size}`,
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
