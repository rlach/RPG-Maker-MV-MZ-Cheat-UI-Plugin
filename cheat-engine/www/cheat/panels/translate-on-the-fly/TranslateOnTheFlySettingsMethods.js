import { TranslateOnTheFlyState } from "../../js/TranslateOnTheFlyState.js";
import { createEngine } from "../../translate-engines/index.js";
import {
  createPersistedTranslationSettingsDefaults,
  normalizePersistedTranslationSettings,
  serializePersistedTranslationSettings,
} from "./TranslationRuntimeDefaults.js";

const sanitizeEngineConfigForPersistence = (engineConfig = {}) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(engineConfig)) {
    if (/Options$/i.test(key)) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
};

export const translateOnTheFlySettingsMethods = {
  loadSettings() {
    const json = this.kvStorage.getItem("data");

    let normalized;
    if (!json) {
      normalized = createPersistedTranslationSettingsDefaults();
    } else {
      try {
        normalized = normalizePersistedTranslationSettings(JSON.parse(json));
      } catch (error) {
        console.warn(
          "[TranslateOnTheFly] Failed to parse settings JSON, using defaults:",
          error,
        );
        normalized = createPersistedTranslationSettingsDefaults();
      }
    }

    Object.assign(this, normalized);

    TranslateOnTheFlyState.setEnabled(this.enabled, { notify: false });
  },

  saveSettings() {
    // Collect engine-specific settings before saving
    if (this.engine) {
      const engineConfig = sanitizeEngineConfigForPersistence({
        ...this.engine.getConfigData(),
      });
      if (!this.engineSettings) {
        this.engineSettings = {};
      }
      this.engineSettings[this.translationEngine] = engineConfig;
    }

    const data = serializePersistedTranslationSettings({
      ...this,
      enabled: TranslateOnTheFlyState.isEnabled(),
      engineSettings: this.engineSettings || {},
    });
    this.kvStorage.setItem("data", JSON.stringify(data));
  },

  onChangeCacheOnly() {
    // When real-time is enabled, this flag is ignored; still persist for when disabled later
    this.saveSettings();
    this.notifyCacheRuntime("settings-cache-only");
  },

  onChangeTryTranslateAhead() {
    this.saveSettings();
  },

  onChangeTranslateGameObjects() {
    this.saveSettings();
  },

  onChangeCancelBackgroundForOnTheFly() {
    this.saveSettings();
  },

  onChangeEnabled() {
    TranslateOnTheFlyState.setEnabled(this.enabled);
    this.saveSettings();
    this.notifyCacheRuntime("settings-enabled");
    if (this.enabled) {
      console.log("[TranslateOnTheFly] Translation enabled");
    } else {
      console.log("[TranslateOnTheFly] Translation disabled");
    }
  },

  onChangeSourceLang() {
    // Don't clear cache - keys contain source/target lang, so they don't conflict
    this.saveSettings();
    this.notifyCacheRuntime("settings-language");
  },

  onChangeTargetLang() {
    // Don't clear cache - keys contain source/target lang, so they don't conflict
    this.saveSettings();
    this.notifyCacheRuntime("settings-language");
  },

  onChangeTranslationEngine() {
    // Save current engine's configuration before switching
    if (this.engine) {
      const currentConfig = sanitizeEngineConfigForPersistence(
        this.engine.getConfigData(),
      );
      if (!this.engineSettings) {
        this.engineSettings = {};
      }
      this.engineSettings[this.translationEngine] = currentConfig;
    }

    // Create new engine instance
    this.engine = createEngine(this.translationEngine, this);

    // Restore settings for new engine if available
    if (this.engineSettings && this.engineSettings[this.translationEngine]) {
      const engineConfig = this.engineSettings[this.translationEngine];
      Object.assign(this.engine, engineConfig);
      if (typeof this.engine.setCustomTags === "function") {
        this.engine.setCustomTags(this.engine.customTags || []);
      }
    }

    // Bind new engine config data to panel
    const engineConfigData = this.engine.getConfigData();
    Object.keys(engineConfigData).forEach((key) => {
      this.$set(this, key, engineConfigData[key]);
    });

    // Bind new engine config methods to panel
    const engineConfigMethods = this.engine.getConfigMethods();
    Object.keys(engineConfigMethods).forEach((methodName) => {
      this[methodName] = engineConfigMethods[methodName].bind(this.engine);
    });

    // Don't clear cache - keys contain engine name, so they don't conflict
    this.saveSettings();
  },

  onChangeTextWrapping() {
    // Don't clear cache - wrapping doesn't affect cache validity
    this.saveSettings();
  },

  onChangeMaxWidth() {
    // Don't clear cache - wrapping is applied on display, not stored in cache
    this.saveSettings();
  },

  onChangeDescriptionMaxWidth() {
    // Don't clear cache - wrapping is applied on display, not stored in cache
    this.saveSettings();
  },

  onChangeCharLimit() {
    // Persist new batch character limit
    // Ensure sensible minimum
    if (!this.charLimit || this.charLimit < 200) this.charLimit = 200;
    this.saveSettings();
  },

  onChangeBatchItemsLimit() {
    if (!this.batchItemsLimit || this.batchItemsLimit < 1)
      this.batchItemsLimit = 1;
    this.saveSettings();
  },
};
