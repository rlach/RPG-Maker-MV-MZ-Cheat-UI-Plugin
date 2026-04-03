import { BasePluginTranslator } from "../BasePluginTranslator.js";

const RUNTIME_HOOK_GUARD = "__CHEAT_CBR_ERO_STATUS_MV_TRANSLATOR_HOOKED__";
const PAGE_PLUGIN_NAME_RE = /^CBR_eroStatus_(\d+)$/i;

function getRuntime() {
  return typeof window.__ensureTranslationRuntime === "function"
    ? window.__ensureTranslationRuntime()
    : window.__TranslationRuntime || null;
}

function isUsableText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

export class CbrEroStatusMvTranslator extends BasePluginTranslator {
  constructor() {
    super();
    this._scanPrepared = false;
    this._scanEntries = [];
    this._scanPromise = null;
    this._originalSubjectMap = new WeakMap();
  }

  getPluginName() {
    return "CBR_eroStatus_main";
  }

  getPluginLabel() {
    return "CBR eroStatus (MV)";
  }

  getCacheType() {
    return "plugin_cbr_erostatus_mv";
  }

  findPagePluginEntries() {
    const plugins = toSafeArray(window.$plugins);
    const result = [];

    for (const plugin of plugins) {
      if (!plugin || typeof plugin.name !== "string") {
        continue;
      }

      const match = PAGE_PLUGIN_NAME_RE.exec(plugin.name.trim());
      if (!match) {
        continue;
      }

      result.push({
        pageNo: Number(match[1]) || 0,
        name: plugin.name,
        parameters: plugin.parameters && typeof plugin.parameters === "object"
          ? plugin.parameters
          : {},
      });
    }

    result.sort((a, b) => a.pageNo - b.pageNo);
    return result;
  }

  appendScanEntriesFromParameters(parameters, pageNo, output, scope) {
    if (!parameters || typeof parameters !== "object" || !Array.isArray(output)) {
      return;
    }

    for (let index = 1; index < 100; index++) {
      const key = `txtSubject_${index}`;
      const text = typeof parameters[key] === "string" ? parameters[key] : "";
      if (!isUsableText(text)) {
        continue;
      }

      output.push({
        text,
        source: {
          scope,
          pageNo,
          rowNo: index,
        },
      });
    }
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
          id: `plugin_cbr_erostatus_mv_${byCacheKey.size}`,
          value: text,
          cacheKey,
        });
      }
    }

    return Array.from(byCacheKey.values());
  }

  translateSubjectValue(subject, runtime) {
    if (!isUsableText(subject)) {
      return subject;
    }

    if (
      !runtime ||
      typeof runtime.getCacheKey !== "function" ||
      typeof runtime.hasUsableCacheValue !== "function" ||
      !(runtime.translationCache instanceof Map)
    ) {
      return subject;
    }

    const cacheKey = runtime.getCacheKey(subject, this.getCacheType());
    if (typeof runtime.markCacheKeySeen === "function") {
      runtime.markCacheKeySeen(cacheKey);
    }

    if (!runtime.hasUsableCacheValue(cacheKey)) {
      return subject;
    }

    const cached = runtime.translationCache.get(cacheKey);
    return isUsableText(cached) ? cached : subject;
  }

  applyRuntimeSubjectTranslations() {
    const pages = toSafeArray(window.CBR_eroStatus);
    const runtime = getRuntime();
    if (!runtime) {
      return;
    }

    for (const page of pages) {
      if (!page || !Array.isArray(page.t)) {
        continue;
      }

      for (const item of page.t) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const currentSubject = typeof item.subject === "string" ? item.subject : "";
        if (!isUsableText(currentSubject)) {
          continue;
        }

        if (!this._originalSubjectMap.has(item)) {
          this._originalSubjectMap.set(item, currentSubject);
        }

        const sourceText = this._originalSubjectMap.get(item);
        const translated = this.translateSubjectValue(sourceText, runtime);
        if (translated !== item.subject) {
          item.subject = translated;
        }
      }
    }
  }

  enablePluginTranslation() {
    if (window[RUNTIME_HOOK_GUARD]) {
      return;
    }

    if (
      !window.Window_EroStatus ||
      !Window_EroStatus.prototype ||
      typeof Window_EroStatus.prototype.update !== "function"
    ) {
      return;
    }

    const original = Window_EroStatus.prototype.update;
    const translator = this;

    Window_EroStatus.prototype.update = function() {
      try {
        translator.applyRuntimeSubjectTranslations();
      } catch (error) {
        console.warn(
          "[CbrEroStatusMvTranslator] Failed to apply runtime CBR_eroStatus subject translation",
          error,
        );
      }

      return original.apply(this, arguments);
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
        console.warn("[CbrEroStatusMvTranslator] Scan failed", error);
      })
      .finally(() => {
        this._scanPromise = null;
      });

    return this._scanPromise;
  }

  buildScanEntries() {
    const entries = [];

    const pageEntries = this.findPagePluginEntries();
    for (const pageEntry of pageEntries) {
      this.appendScanEntriesFromParameters(
        pageEntry.parameters,
        pageEntry.pageNo,
        entries,
        "pluginEntryParameter",
      );

      if (
        window.PluginManager &&
        typeof PluginManager.parameters === "function"
      ) {
        const runtimeParameters = PluginManager.parameters(pageEntry.name);
        this.appendScanEntriesFromParameters(
          runtimeParameters,
          pageEntry.pageNo,
          entries,
          "runtimePluginManagerParameter",
        );
      }
    }

    return entries;
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