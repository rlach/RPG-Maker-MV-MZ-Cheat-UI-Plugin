import { TranslateOnTheFlyState } from "../../js/TranslateOnTheFlyState.js";
import { createEngine } from "../../translate-engines/index.js";

export const translateOnTheFlySettingsMethods = {
  loadSettings() {
    const json = this.kvStorage.getItem("data");

    if (!json) {
      // Use defaults
      this.enabled = false;
      this.sourceLang = "ja";
      this.enableTextWrapping = true;
      this.maxLineWidth = 60;
      this.translateCacheWhenDisabled = false;
      this.tryTranslateAhead = false;
      TranslateOnTheFlyState.setEnabled(this.enabled, { notify: false });
      return;
    }

    const data = JSON.parse(json);
    this.enabled = data.enabled || false;
    this.sourceLang = data.sourceLang || "ja";
    this.targetLang = data.targetLang || "en";
    this.translationCount = data.translationCount || 0;
    this.enableTextWrapping =
      data.enableTextWrapping !== undefined ? data.enableTextWrapping : true;
    this.maxLineWidth = data.maxLineWidth || 60;
    this.descriptionMaxLineWidth = data.descriptionMaxLineWidth || 59;
    this.charLimit = data.charLimit || 1000;
    this.batchItemsLimit = data.batchItemsLimit || 20;
    const savedEngine = data.translationEngine || "mymemory";
    this.translationEngine =
      savedEngine === "gpt4all" ? "openApi" : savedEngine;
    this.translateCacheWhenDisabled = data.translateCacheWhenDisabled || false;
    this.tryTranslateAhead = data.tryTranslateAhead || false;
    this.translateGameObjects =
      data.translateGameObjects !== undefined
        ? data.translateGameObjects
        : true;
    this.cancelBackgroundForOnTheFly =
      data.cancelBackgroundForOnTheFly !== undefined
        ? data.cancelBackgroundForOnTheFly
        : false;

    // Load engine-specific settings
    this.engineSettings = data.engineSettings || {};
    if (this.engineSettings.gpt4all && !this.engineSettings.openApi) {
      this.engineSettings.openApi = this.engineSettings.gpt4all;
      delete this.engineSettings.gpt4all;
    }

    TranslateOnTheFlyState.setEnabled(this.enabled, { notify: false });
  },

  saveSettings() {
    // Collect engine-specific settings before saving
    if (this.engine) {
      const engineConfig = { ...this.engine.getConfigData() };
      if (!this.engineSettings) {
        this.engineSettings = {};
      }
      this.engineSettings[this.translationEngine] = engineConfig;
    }

    const data = {
      enabled: TranslateOnTheFlyState.isEnabled(),
      sourceLang: this.sourceLang,
      targetLang: this.targetLang,
      translationCount: this.translationCount,
      enableTextWrapping: this.enableTextWrapping,
      maxLineWidth: this.maxLineWidth,
      descriptionMaxLineWidth: this.descriptionMaxLineWidth,
      charLimit: this.charLimit,
      batchItemsLimit: this.batchItemsLimit,
      translationEngine: this.translationEngine,
      translateCacheWhenDisabled: this.translateCacheWhenDisabled,
      tryTranslateAhead: this.tryTranslateAhead,
      translateGameObjects: this.translateGameObjects,
      cancelBackgroundForOnTheFly: this.cancelBackgroundForOnTheFly,
      engineSettings: this.engineSettings || {},
    };
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
      const currentConfig = this.engine.getConfigData();
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
