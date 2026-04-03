import { BasePluginTranslator } from "../BasePluginTranslator.js";

const RUNTIME_HOOK_GUARD = "__CHEAT_SCENE_GLOSSARY_TRANSLATOR_HOOKED__";
const ITEM_NOTE_CACHE_TYPE = "item_note";

function getRuntime() {
  return typeof window.__ensureTranslationRuntime === "function"
    ? window.__ensureTranslationRuntime()
    : window.__TranslationRuntime || null;
}

function isUsableText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function extractGlossaryDescriptionEntries(noteText) {
  const result = [];
  const text = String(noteText || "");
  if (!text.trim()) {
    return result;
  }

  const extractedKeys = new Set();
  const regex = /<\s*(SG(?:説明|Description)\d*)\s*:\s*([\s\S]*?)>/gi;
  let match = null;

  while ((match = regex.exec(text)) !== null) {
    const key = String(match[1] || "").trim();
    const value = String(match[2] || "");
    if (!key || !isUsableText(value)) {
      continue;
    }

    result.push({ key, value });
    extractedKeys.add(key.toLowerCase());
  }

  // Fallback for malformed notes where SG description tag is not closed with ">".
  const startRegex = /<\s*(SG(?:説明|Description)\d*)\s*:/gi;
  const starts = [];
  let startMatch = null;
  while ((startMatch = startRegex.exec(text)) !== null) {
    starts.push({
      key: String(startMatch[1] || "").trim(),
      valueStart: startRegex.lastIndex,
      startIndex: startMatch.index,
    });
  }

  for (let i = 0; i < starts.length; i++) {
    const current = starts[i];
    const key = current && current.key ? current.key : "";
    if (!key || extractedKeys.has(key.toLowerCase())) {
      continue;
    }

    const nextStart = i + 1 < starts.length ? starts[i + 1].startIndex : text.length;
    let value = text.slice(current.valueStart, nextStart);
    value = value.replace(/\r?\n>\s*$/, "").trim();

    if (!isUsableText(value)) {
      continue;
    }

    result.push({ key, value });
    extractedKeys.add(key.toLowerCase());
  }

  return result;
}

export class SceneGlossaryTranslator extends BasePluginTranslator {
  constructor() {
    super();
    this._scanPrepared = false;
    this._scanEntries = [];
    this._scanPromise = null;
  }

  getPluginName() {
    return "SceneGlossary";
  }

  getPluginLabel() {
    return "SceneGlossary";
  }

  getCacheType() {
    return "plugin_scene_glossary";
  }

  getOriginalItemNote(item) {
    if (!item || typeof item !== "object") {
      return "";
    }

    const originalMap =
      item._translateOriginal && typeof item._translateOriginal === "object"
        ? item._translateOriginal
        : null;

    if (originalMap && isUsableText(originalMap.note)) {
      return originalMap.note;
    }

    return isUsableText(item.note) ? item.note : "";
  }

  buildMetaPatchFromTranslatedNote(translatedNote) {
    const patch = {};
    const entries = extractGlossaryDescriptionEntries(translatedNote);

    for (const entry of entries) {
      const suffixMatch = /^SG(?:説明|Description)(\d*)$/i.exec(entry.key);
      const suffix = suffixMatch ? suffixMatch[1] || "" : "";
      patch[`SG説明${suffix}`] = entry.value;
      patch[`SGDescription${suffix}`] = entry.value;
    }

    return patch;
  }

  applyGlossaryTranslation(item) {
    if (!item || typeof item !== "object") {
      return;
    }

    const runtime = getRuntime();
    if (
      !runtime ||
      typeof runtime.getCacheKey !== "function" ||
      typeof runtime.hasUsableCacheValue !== "function" ||
      !(runtime.translationCache instanceof Map)
    ) {
      return;
    }

    const originalNote = this.getOriginalItemNote(item);
    if (!isUsableText(originalNote)) {
      return;
    }

    const cacheKey = runtime.getCacheKey(originalNote, ITEM_NOTE_CACHE_TYPE);
    if (typeof runtime.markCacheKeySeen === "function") {
      runtime.markCacheKeySeen(cacheKey);
    }

    if (!runtime.hasUsableCacheValue(cacheKey)) {
      return;
    }

    const translatedNote = runtime.translationCache.get(cacheKey);
    if (!isUsableText(translatedNote)) {
      return;
    }

    const patch = this.buildMetaPatchFromTranslatedNote(translatedNote);
    if (!Object.keys(patch).length) {
      return;
    }

    const baseMeta = item.meta && typeof item.meta === "object" ? item.meta : {};
    item.meta = {
      ...baseMeta,
      ...patch,
    };
  }

  enablePluginTranslation() {
    if (window[RUNTIME_HOOK_GUARD]) {
      return;
    }

    if (
      !window.Scene_Glossary ||
      !Scene_Glossary.prototype ||
      typeof Scene_Glossary.prototype.createGlossaryWindow !== "function"
    ) {
      return;
    }

    const translator = this;
    const originalCreateGlossaryWindow = Scene_Glossary.prototype.createGlossaryWindow;

    Scene_Glossary.prototype.createGlossaryWindow = function() {
      const result = originalCreateGlossaryWindow.apply(this, arguments);
      const glossaryWindow = this._glossaryWindow;

      if (
        !glossaryWindow ||
        typeof glossaryWindow.refresh !== "function" ||
        glossaryWindow.__cheatSceneGlossaryRefreshHooked
      ) {
        return result;
      }

      const originalRefresh = glossaryWindow.refresh;
      glossaryWindow.refresh = function(item) {
        try {
          const targetItem = item || this._itemData || null;
          translator.applyGlossaryTranslation(targetItem);
        } catch (error) {
          console.warn(
            "[SceneGlossaryTranslator] Failed to apply glossary translation in refresh",
            error,
          );
        }

        return originalRefresh.apply(this, arguments);
      };

      glossaryWindow.__cheatSceneGlossaryRefreshHooked = true;
      return result;
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
        console.warn("[SceneGlossaryTranslator] Scan failed", error);
      })
      .finally(() => {
        this._scanPromise = null;
      });

    return this._scanPromise;
  }

  buildScanEntries() {
    return [];
  }

  collectUntranslated() {
    return [];
  }

  countPluginAmountSync() {
    return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
  }
}
