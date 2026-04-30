import { BasePluginTranslator } from "../BasePluginTranslator.js";

const RUNTIME_HOOK_GUARD = "__CHEAT_PANDA_PROGRESS_TEXT_WINDOW_TRANSLATOR_HOOKED__";

function parseJsonSafely(value, fallback) {
  if (typeof value !== "string") {
    return value ?? fallback;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function isUsableText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function getRuntime() {
  return window.__ensureTranslationRuntime?.() || window.__TranslationRuntime || null;
}

export class PandaProgressTextWindowTranslator extends BasePluginTranslator {
  constructor() {
    super();
    this._scanPrepared = false;
    this._scanEntries = [];
    this._scanPromise = null;
  }

  getPluginName() {
    return "PANDA_ProgressTextWindow";
  }

  getPluginLabel() {
    return "PANDA ProgressTextWindow";
  }

  getCacheType() {
    return "plugin_panda_progress_text_window";
  }

  findPluginEntry() {
    if (!Array.isArray(window.$plugins)) {
      return null;
    }

    const pluginName = String(this.getPluginName() || "").trim().toLowerCase();
    if (!pluginName) {
      return null;
    }

    return (
      window.$plugins.find((plugin) => {
        if (!plugin || typeof plugin.name !== "string") {
          return false;
        }

        return plugin.name.trim().toLowerCase() === pluginName;
      }) || null
    );
  }

  parseProgressTextParameter(rawValue) {
    if (typeof rawValue !== "string") {
      return [];
    }

    const normalized = rawValue.trim();
    if (!normalized) {
      return [];
    }

    const parsed = parseJsonSafely(normalized.replace(/\\\\n/g, "\\n"), []);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const result = [];
    for (const item of parsed) {
      if (typeof item !== "string") {
        continue;
      }

      const decoded = parseJsonSafely(item, item);
      if (isUsableText(decoded)) {
        result.push(decoded);
      }
    }

    return result;
  }

  appendEntriesFromParameters(parameters, scope, output) {
    if (!parameters || typeof parameters !== "object" || !Array.isArray(output)) {
      return;
    }

    const texts = this.parseProgressTextParameter(parameters.ProgressText);
    for (let index = 0; index < texts.length; index++) {
      output.push({
        text: texts[index],
        source: {
          scope,
          progressIndex: index + 1,
        },
      });
    }
  }

  isProgressWindowInstance(windowInstance) {
    if (!windowInstance || typeof windowInstance !== "object") {
      return false;
    }

    const ctorName =
      windowInstance.constructor && typeof windowInstance.constructor.name === "string"
        ? windowInstance.constructor.name
        : "";

    return ctorName === "Window_Progress";
  }

  translateRuntimeText(text, runtime) {
    if (!isUsableText(text)) {
      return text;
    }

    if (
      !runtime ||
      typeof runtime.getCacheKey !== "function" ||
      typeof runtime.hasUsableCacheValue !== "function" ||
      !(runtime.translationCache instanceof Map)
    ) {
      return text;
    }

    const cacheKey = runtime.getCacheKey(text, this.getCacheType());

    runtime.markCacheKeySeen?.(cacheKey);

    if (!runtime.hasUsableCacheValue(cacheKey)) {
      return text;
    }

    const cached = runtime.translationCache.get(cacheKey);
    return isUsableText(cached) ? cached : text;
  }

  enablePluginTranslation() {
    if (window[RUNTIME_HOOK_GUARD]) {
      return;
    }

    if (
      !window.Window_Help ||
      !Window_Help.prototype ||
      typeof Window_Help.prototype.setText !== "function"
    ) {
      return;
    }

    const originalSetText = Window_Help.prototype.setText;
    const translator = this;

    Window_Help.prototype.setText = function(text) {
      try {
        if (translator.isProgressWindowInstance(this)) {
          const runtime = getRuntime();
          const translated = translator.translateRuntimeText(text, runtime);
          if (translated !== text) {
            arguments[0] = translated;
          }
        }
      } catch (error) {
        console.warn(
          "[PandaProgressTextWindowTranslator] Failed to apply runtime progress text translation",
          error,
        );
      }

      return originalSetText.apply(this, arguments);
    };

    window[RUNTIME_HOOK_GUARD] = true;
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

    this._scanPromise = Promise.resolve(this.buildScanEntries())
      .then((entries) => {
        this._scanEntries = Array.isArray(entries) ? entries : [];
        this._scanPrepared = true;
      })
      .catch((error) => {
        console.warn("[PandaProgressTextWindowTranslator] Scan failed", error);
      })
      .finally(() => {
        this._scanPromise = null;
      });

    return this._scanPromise;
  }

  buildScanEntries() {
    const entries = [];

    const pluginEntry = this.findPluginEntry();
    if (pluginEntry && pluginEntry.parameters) {
      this.appendEntriesFromParameters(
        pluginEntry.parameters,
        "pluginEntryParameter",
        entries,
      );
    }

    if (
      window.PluginManager &&
      typeof PluginManager.parameters === "function"
    ) {
      const runtimeParameters = PluginManager.parameters(this.getPluginName());
      this.appendEntriesFromParameters(
        runtimeParameters,
        "runtimePluginManagerParameter",
        entries,
      );
    }

    return entries;
  }

  buildUniquePendingItems(panel) {
    const byCacheKey = new Map();

    for (const entry of this._scanEntries) {
      const text = typeof entry.text === "string" ? entry.text : "";
      if (!isUsableText(text)) {
        continue;
      }

      const cacheKey = panel.getCacheKey(text, this.getCacheType());
      if (!byCacheKey.has(cacheKey)) {
        byCacheKey.set(cacheKey, {
          type: this.getCacheType(),
          id: `plugin_panda_progress_text_window_${byCacheKey.size}`,
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
