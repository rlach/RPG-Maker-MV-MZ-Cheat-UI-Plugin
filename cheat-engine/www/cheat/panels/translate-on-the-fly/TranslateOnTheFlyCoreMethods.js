import { Alert } from "../../js/AlertHelper.js";
import { MessageCheat } from "../../js/CheatHelper.js";
import { TranslateOnTheFlyState } from "../../js/TranslateOnTheFlyState.js";
import { ensureTranslateCacheRuntime } from "../../js/TranslateCacheRuntime.js";
import { BatchSummaryReporter } from "../../translate-engines/batch-manager/BatchSummaryReporter.js";
import { TranslationBatchManager } from "../../translate-engines/batch-manager/TranslationBatchManager.js";

export const translateOnTheFlyCoreMethods = {
  isTranslationEnabled() {
    const stateEnabled = TranslateOnTheFlyState.isEnabled();
    const localEnabled = this.enabled;
    const enabled = stateEnabled || localEnabled;
    if (enabled && !this._loggedEnabledOnce) {
      console.log(
        "[TranslateOnTheFly] isTranslationEnabled true (state/local):",
        stateEnabled,
        localEnabled,
      );
      this._loggedEnabledOnce = true;
    }
    return enabled;
  },

  isSkippingMessages() {
    return !!(MessageCheat && MessageCheat.skip);
  },

  applyExternalToggle(enabled, notify = false) {
    TranslateOnTheFlyState.setEnabled(enabled);
    this.enabled = enabled;
    this.saveSettings();
    this.notifyCacheRuntime("settings-enabled");

    if (notify) {
      Alert.success(
        `Real-time translation: ${enabled ? "enabled" : "disabled"}`,
      );
    }
  },

  toggleEnabledExternal(notify = true) {
    const enabled = TranslateOnTheFlyState.toggleEnabled();
    this.applyExternalToggle(enabled, notify);
    return enabled;
  },

  getCacheKey(text, type = "text") {
    const keyText =
      type === "speaker" ? this.ensureSpeakerKeyPrefix(text) : text;
    return `${type}:${this.sourceLang}-${this.targetLang}-${keyText}`;
  },

  getLegacySpeakerCacheKey(speakerName) {
    if (!speakerName) {
      return null;
    }
    return `speaker:${this.sourceLang}-${this.targetLang}-${speakerName}`;
  },

  ensureSpeakerKeyPrefix(text) {
    if (!text) {
      return text;
    }

    return text.startsWith("name_") ? text : `name_${text}`;
  },

  setCacheValue(key, value) {
    const normalizedValue =
      typeof value === "string"
        ? value
        : value === null || value === undefined
          ? ""
          : String(value);
    this.translationCache.set(key, normalizedValue);
    this.persistCache();
    this.notifyCacheRuntime("cache-set", key);
  },

  loadCacheFromDisk() {
    try {
      const json = this.cacheStorage.getItem("data");
      if (!json) {
        return;
      }
      const entries = JSON.parse(json);
      if (Array.isArray(entries)) {
        if (!this.translationCache) {
          const runtime = ensureTranslateCacheRuntime(new Map());
          this.translationCache = runtime.cache;
          this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
        }
        this.translationCache.clear();
        for (const [k, v] of entries) {
          const normalizedValue =
            typeof v === "string"
              ? v
              : v === null || v === undefined
                ? ""
                : String(v);
          this.translationCache.set(k, normalizedValue);
        }
        this.notifyCacheRuntime("cache-loaded");
      }
    } catch (error) {
      console.warn(
        "[TranslateOnTheFly] Failed to load cache, starting fresh",
        error,
      );
      const runtime = ensureTranslateCacheRuntime(new Map());
      this.translationCache = runtime.cache;
      this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
      this.notifyCacheRuntime("cache-load-failed-reset");
    }
  },

  persistCache() {
    try {
      const payload = JSON.stringify(
        Array.from(this.translationCache.entries()),
      );
      this.cacheStorage.setItem("data", payload);
    } catch (error) {
      console.warn("[TranslateOnTheFly] Failed to persist cache", error);
    }
  },

  applyCachedTranslations(
    dataContainer,
    fields,
    cacheKeyPrefix,
    instanceContainer,
    instanceFunctionName,
  ) {
    let appliedCount = 0;
    for (let i = 1; i < dataContainer.length; i++) {
      const item = dataContainer[i];
      if (!item) continue;

      let itemInstance;
      if (
        instanceContainer &&
        instanceFunctionName &&
        typeof instanceContainer[instanceFunctionName] === "function"
      ) {
        itemInstance = instanceContainer[instanceFunctionName](item.id);
      }

      if (!item._translateOriginal) {
        item._translateOriginal = {};
        for (const field of fields) {
          item._translateOriginal[field] = item[field];
        }
      }

      for (const field of fields) {
        const originalValue = item._translateOriginal[field];
        if (
          originalValue &&
          typeof originalValue === "string" &&
          originalValue.trim() !== ""
        ) {
          const cacheKey = this.getCacheKey(
            originalValue,
            `${cacheKeyPrefix}_${field}`,
          );
          if (this.hasUsableCacheValue(cacheKey)) {
            try {
              item[field] = this.translationCache.get(cacheKey);
              if (itemInstance) {
                itemInstance[`_${field}`] = item[field];
              }
              appliedCount++;
            } catch (error) {
              console.log(error);
            }
          }
        }
      }
    }
    return appliedCount;
  },

  applyCachedActorClassEnemyTranslations() {
    this.applyCachedTranslations(
      $dataActors,
      ["name", "nickname", "profile"],
      "actor",
      $gameActors,
      "actor",
    );
    this.applyCachedTranslations($dataClasses, ["name"], "class");
    this.applyCachedTranslations($dataEnemies, ["name"], "enemy");
  },

  checkIfDataIsLoaded() {
    return (
      !window.$dataItems ||
      !window.$dataSkills ||
      !window.$dataArmors ||
      !window.$dataWeapons ||
      !window.$dataMapInfos ||
      !window.$dataClasses ||
      !window.$dataEnemies
    );
  },

  applyCachedTranslationsToData() {
    if (this.checkIfDataIsLoaded()) {
      console.log(
        "[TranslateOnTheFly] Game data not fully loaded, cannot apply cached translations",
      );
      setTimeout(() => {
        this.applyCachedTranslationsToData();
      }, 2000);
      return;
    }

    let appliedCount = 0;

    for (const def of this.getObjectTranslationTypeDefs().filter(
      (d) => d.kind === "data",
    )) {
      const container = def.getContainer && def.getContainer();
      if (!Array.isArray(container)) continue;
      const instanceContainer =
        def.cachePrefix === "actor" ? $gameActors : null;
      const instanceFunctionName = def.cachePrefix === "actor" ? "actor" : null;
      appliedCount += this.applyCachedTranslations(
        container,
        def.fields,
        def.cachePrefix,
        instanceContainer,
        instanceFunctionName,
      );
    }

    if (appliedCount > 0) {
      console.log(
        `[TranslateOnTheFly] Applied ${appliedCount} cached translations to objects`,
      );
    }
  },

  hasUntranslatedFields(dataObject, fields, type) {
    if (!dataObject._translateOriginal) {
      dataObject._translateOriginal = {};
      for (const field of fields) {
        dataObject._translateOriginal[field] = dataObject[field];
      }
    }

    for (const field of fields) {
      const value = dataObject._translateOriginal[field];
      if (value && typeof value === "string" && value.trim() !== "") {
        const cacheKey = this.getCacheKey(value, `${type}_${field}`);
        if (!this.hasUsableCacheValue(cacheKey)) {
          return true;
        }
      }
    }

    return false;
  },

  async translateDataBatch(dataObjects, fields, type, options = {}) {
    if (!this.batchManager) {
      this.batchManager = new TranslationBatchManager(this);
    }

    return this.batchManager.translateDataBatch(
      dataObjects,
      fields,
      type,
      options,
    );
  },

  async translateAllMaps() {
    try {
      const startedAt = Date.now();
      if (!this.engine || !this.isEngineFullyConfigured()) {
        Alert.error("Translation engine not fully configured");
        return;
      }

      if (!$dataMapInfos || !Array.isArray($dataMapInfos)) {
        Alert.error("Map info not loaded");
        return;
      }

      console.log("[TranslateOnTheFly] Starting translation of all maps");

      const validMaps = this.getValidMapInfos();

      if (validMaps.length === 0) {
        Alert.warn("No valid maps found");
        return;
      }

      console.log(
        `[TranslateOnTheFly] Found ${validMaps.length} maps to translate`,
      );

      let totalTranslated = 0;
      let totalFailed = 0;
      let totalTarget = 0;
      const aggregatedErrorStats =
        BatchSummaryReporter.createErrorStatsAccumulator();

      console.log("[TranslateOnTheFly] Translating common events first");
      try {
        const result = await this.translateMapEvents(
          {
            events: [
              {
                pages: $dataCommonEvents,
              },
            ],
          },
          -1,
          null,
          "translating common events",
        );
        if (result) {
          totalTranslated += result.successCount || 0;
          totalFailed += result.failureCount || 0;
          totalTarget += result.totalCount || 0;
          BatchSummaryReporter.mergeErrorStats(
            aggregatedErrorStats,
            result.stats,
          );
        }
      } catch (error) {
        console.error(
          "[TranslateOnTheFly] Failed to translate common events:",
          error,
        );
      }

      for (let i = 0; i < validMaps.length; i++) {
        const mapInfo = validMaps[i];
        const mapId = mapInfo.id;
        const mapNumber = i + 1;

        console.log(
          `[TranslateOnTheFly] Processing map ${mapNumber}/${validMaps.length}: ${mapInfo.name} (ID: ${mapId})`,
        );

        try {
          const mapData = await this.loadMapDataById(mapId);
          const result = await this.translateMapEvents(
            mapData,
            mapNumber,
            validMaps.length,
            `translating map ${mapNumber}/${validMaps.length}`,
          );
          if (result) {
            totalTranslated += result.successCount || 0;
            totalFailed += result.failureCount || 0;
            totalTarget += result.totalCount || 0;
            BatchSummaryReporter.mergeErrorStats(
              aggregatedErrorStats,
              result.stats,
            );
          }
        } catch (error) {
          console.error(
            `[TranslateOnTheFly] Failed to load or translate map ${mapId}:`,
            error,
          );
        }
      }

      this.hideProgressBox();
      const summary = BatchSummaryReporter.buildSummary({
        batchLabel: "all maps translation",
        totalItems: totalTarget,
        successes: totalTranslated,
        failures: totalFailed,
        errorStats: aggregatedErrorStats,
        durationMs: Date.now() - startedAt,
      });
      BatchSummaryReporter.showAlert(summary);
      BatchSummaryReporter.logSummary(summary);
    } catch (error) {
      this.hideProgressBox();
      console.error("[TranslateOnTheFly] translateAllMaps error:", error);
      Alert.error("Failed to translate all maps: " + error.message);
    }
  },

  async translateMapEvents(
    mapData = null,
    mapNumber = null,
    totalMaps = null,
    progressLabel = null,
  ) {
    if (!this.batchManager) {
      this.batchManager = new TranslationBatchManager(this);
    }

    return this.batchManager.translateMapEvents(
      mapData,
      mapNumber,
      totalMaps,
      progressLabel,
    );
  },
};
