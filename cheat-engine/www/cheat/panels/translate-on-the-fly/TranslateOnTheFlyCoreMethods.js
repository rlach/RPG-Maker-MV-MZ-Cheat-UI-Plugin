import { Alert } from "../../js/AlertHelper.js";
import { MessageCheat } from "../../js/CheatHelper.js";
import { TranslateOnTheFlyState } from "../../js/TranslateOnTheFlyState.js";
import { ensureTranslateCacheRuntime } from "../../js/TranslateCacheRuntime.js";
import { createTranslationBatchManager } from "../../translate-engines/batch-manager/TranslationBatchManagerFactory.js";
import { DATA_CONTAINER_TRANSLATION_DEFINITIONS } from "../../translate-engines/translation-phases/DataContainerDefinitions.js";

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

  isNonOtfTranslationProcessActive() {
    return !!(
      this.nonOtfTranslationProcess && this.nonOtfTranslationProcess.active
    );
  },

  getActiveNonOtfTranslationProcessLabel() {
    if (!this.isNonOtfTranslationProcessActive()) {
      return "";
    }

    return this.nonOtfTranslationProcess.label || "translation";
  },

  beginNonOtfTranslationProcess(label = "translation") {
    if (this.isNonOtfTranslationProcessActive()) {
      const activeLabel = this.getActiveNonOtfTranslationProcessLabel();
      Alert.warn(
        `Another translation is already in progress (${activeLabel}). Only On-The-Fly translation can run in parallel.`,
      );
      return false;
    }

    this.nonOtfTranslationProcess = {
      active: true,
      label,
      startedAt: Date.now(),
    };
    return true;
  },

  endNonOtfTranslationProcess() {
    this.nonOtfTranslationProcess = {
      active: false,
      label: "",
      startedAt: 0,
    };
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

  setCacheValue(key, value, options = {}) {
    const normalizedValue =
      typeof value === "string"
        ? value
        : value === null || value === undefined
          ? ""
          : String(value);
    this.translationCache.set(key, normalizedValue);

    const persist = options.persist === undefined ? true : !!options.persist;
    if (persist) {
      this.persistCache();
    }

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

  scheduled: false,
  saving: false,

  persistCache() {
    this.scheduled = true

    if (!this.saving) {
      setTimeout(() => this.flush(), 1000);
    }
  },

  async flush() {
    if (this.saving) {
      return;
    }
    this.saving = true;

      do {
        this.scheduled = false;

        const payload = JSON.stringify(
          Array.from(this.translationCache.entries()),
        );

        await this.cacheStorage.setItemAsync("data", payload);

      } while (this.scheduled)

      this.saving = false
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

  getResolvedDataContainerDefinitions(allowedCachePrefixes = null) {
    const allowedSet = Array.isArray(allowedCachePrefixes)
      ? new Set(allowedCachePrefixes)
      : null;
    const resolved = [];

    for (const definition of DATA_CONTAINER_TRANSLATION_DEFINITIONS) {
      if (allowedSet && !allowedSet.has(definition.cachePrefix)) {
        continue;
      }

      const container = definition.getContainer?.();
      if (!Array.isArray(container)) {
        continue;
      }

      resolved.push({
        container,
        fields: definition.fields,
        cachePrefix: definition.cachePrefix,
        instanceContainer: definition.getInstanceContainer?.() || null,
        instanceFunctionName: definition.instanceFunctionName || null,
      });
    }

    return resolved;
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
    const resolvedDefinitions = this.getResolvedDataContainerDefinitions();

    for (const definition of resolvedDefinitions) {
      appliedCount += this.applyCachedTranslations(
        definition.container,
        definition.fields,
        definition.cachePrefix,
        definition.instanceContainer,
        definition.instanceFunctionName || null,
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
    if (!Array.isArray(dataObjects) || !Array.isArray(fields) || !type) {
      return { successes: 0, failures: 0, stats: null };
    }

    const translated = await this.batchManager.runBatchedTranslation(
      [
        {
          kind: "dataObjects",
          dataObjects,
          fields,
          type,
          backgroundJob: !!options.backgroundJob,
        },
      ],
      {
        ...options,
        backgroundJob: !!options.backgroundJob,
        showSummary: false,
      },
    );

    return {
      successes: translated.successes.length,
      failures: translated.failures.length,
      stats: translated.stats,
    };
  },

  async translateAllMaps() {
    const validMaps = this.getValidMapInfos();
    if (validMaps.length === 0) {
      Alert.warn("No valid maps found");
      return;
    }

    const previousSelectedMapIds = Array.isArray(
      this.objectTranslationSelectedMapIds,
    )
      ? [...this.objectTranslationSelectedMapIds]
      : null;

    try {
      this.objectTranslationSelectedMapIds = validMaps.map((map) => map.id);
      await this.runObjectTranslationJob(["commonEvents", "mapEvents"]);
    } finally {
      this.objectTranslationSelectedMapIds = previousSelectedMapIds;
    }
  },

  async translateMapEvents(
    mapData = null,
    mapNumber = null,
    totalMaps = null,
    progressLabel = null,
    options = {},
  ) {
    const skipProcessLock = !!(options && options.skipProcessLock);
    let processStarted = false;

    if (!skipProcessLock) {
      if (!this.beginNonOtfTranslationProcess("map translation")) {
        return {
          successCount: 0,
          failureCount: 0,
          totalCount: 0,
          stats: null,
        };
      }
      processStarted = true;
    }

    if (!this.batchManager) {
      this.batchManager = createTranslationBatchManager(this);
    }

    const mapRequest = {
      kind: "mapEvents",
      mapData: mapData || null,
      mapId: mapData && mapData._mapId ? mapData._mapId : null,
      mapNumber,
      totalMaps,
      progressLabel,
      backgroundJob: !!(options && options.backgroundJob),
      mapIds:
        mapData && mapData._mapId
          ? [mapData._mapId]
          : typeof mapNumber === "number" && mapNumber > 0
            ? [mapNumber]
            : null,
    };
    try {
      const translatedByKind = await this.batchManager.runBatchedTranslation(
        [mapRequest],
        {
          ...options,
          translationPhaseLabel: progressLabel || "translating map",
          backgroundJob: !!(options && options.backgroundJob),
          showSummary: mapNumber === null,
        },
      );

      return {
        successCount: translatedByKind.successes.length,
        failureCount: translatedByKind.failures.length,
        totalCount:
          translatedByKind.successes.length + translatedByKind.failures.length,
        stats: translatedByKind.stats,
      };
    } finally {
      if (processStarted) {
        this.endNonOtfTranslationProcess();
      }
    }
  },
};
