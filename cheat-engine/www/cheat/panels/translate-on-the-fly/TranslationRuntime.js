import { KeyValueStorage } from "../../js/KeyValueStorage.js";
import { createSecureSecretStorage } from '../../js/SecureSecretStorage.js';
import { TranslateOnTheFlyState } from "../../js/TranslateOnTheFlyState.js";
import { ensureTranslateCacheRuntime } from "../../js/TranslateCacheRuntime.js";
import {
  createEngine,
  getAvailableEngines,
} from "../../translate-engines/index.js";
import { createTranslationBatchManager } from "../../translate-engines/batch-manager/TranslationBatchManagerFactory.js";
import { translateOnTheFlySettingsMethods } from "./TranslateOnTheFlySettingsMethods.js";
import { translateOnTheFlyCacheMethods } from "./TranslateOnTheFlyCacheMethods.js";
import { translateOnTheFlyUiMethods } from "./TranslateOnTheFlyUiMethods.js";
import { translateOnTheFlyMessageMethods } from "./TranslateOnTheFlyMessageMethods.js";
import { translateOnTheFlyFlowMethods } from "./TranslateOnTheFlyFlowMethods.js";
import { translateOnTheFlyRuntimeMethods } from "./TranslateOnTheFlyRuntimeMethods.js";
import { objectTranslationRuntimeMethods } from "./ObjectTranslationModalMethods.js";
import { translateOnTheFlyCoreMethods } from "./TranslateOnTheFlyCoreMethods.js";
import {
  createTranslationRuntimeStateDefaults,
  UI_SYNC_STATE_KEYS,
  UI_SYNC_TO_ONLY_STATE_KEYS,
} from "./TranslationRuntimeDefaults.js";

function getHostWindow() {
  if (
    window.__CHEAT_EXTERNAL_WINDOW__ &&
    window.opener &&
    !window.opener.closed
  ) {
    return window.opener;
  }

  return window;
}

class TranslationRuntime {
  constructor() {
    const engineOptions = getAvailableEngines();

    this.$set = (target, key, value) => {
      target[key] = value;
    };

    this._initialized = false;
    this._hookInitialized = false;

    Object.assign(this, createTranslationRuntimeStateDefaults(engineOptions));
  }

  initialize() {
    if (this._initialized) {
      return this;
    }

    this.kvStorage = new KeyValueStorage(
      "./www/cheat-settings/translate-on-the-fly.json",
    );
    this.secureSecretStorage = createSecureSecretStorage();
    this.cacheStorage = new KeyValueStorage(
      "./www/cheat-settings/translate-cache.json",
    );
    const runtime = ensureTranslateCacheRuntime(
      window.__TranslateOnTheFlyCache || new Map(),
    );
    this.translationCache = runtime.cache;
    this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
    this.pendingTranslations = new Map();
    this.failedTranslations = new Map();
    this.translationInProgress = false;
    this._foregroundDialogBatchState = {
      active: false,
      operationKey: "",
      sourceTrigger: "",
      startedAt: 0,
      promise: null,
    };
    this._foregroundBatchWatchdogMs = 60000;
    this._foregroundPreemptedOperationKey = "";

    this.loadSettings();
    this.loadCacheFromDisk();
    this.engine = createEngine(this.translationEngine, this);
    this.batchManager = createTranslationBatchManager(this);

    if (this.engineSettings && this.engineSettings[this.translationEngine]) {
      const engineConfig = this.engineSettings[this.translationEngine];
      Object.assign(this.engine, engineConfig);
      if (typeof this.engine.setCustomTags === "function") {
        this.engine.setCustomTags(this.engine.customTags || []);
      }
    }

    this.bindEngineConfigTo(this);
    this.loadAiApiKeyFromSecureStore().catch((error) => {
      console.warn('[TranslateOnTheFly] Failed to load AI API key from secure storage:', error);
    });
    this.deferHookInitialization();

    this.stateUnsubscribe = TranslateOnTheFlyState.subscribe((enabled) => {
      this.enabled = enabled;
    });

    this._initialized = true;
    this.installWindowAliases();

    if (this.translateCacheWhenDisabled) {
      console.log(
        "[TranslateOnTheFly] Applying cached translations to data objects",
      );
      this.applyCachedTranslationsToData();
    }

    return this;
  }

  installWindowAliases() {
    const host = getHostWindow();
    host.__TranslationRuntime = this;
    host.__TranslateRuntime = this;
  }

  deferHookInitialization() {
    if (this._hookInitialized) {
      return;
    }

    try {
      this.setupTranslationHook();
      this._hookInitialized = true;
      console.log("[TranslateOnTheFly] Hook initialized (immediate)");
      return;
    } catch (error) {
      console.warn(
        "[TranslateOnTheFly] Immediate hook init failed, retrying delayed",
        error,
      );
    }

    setTimeout(() => {
      if (this._hookInitialized) {
        return;
      }
      this.setupTranslationHook();
      this._hookInitialized = true;
      console.log("[TranslateOnTheFly] Hook initialized (delayed)");
    }, 1000);
  }

  bindEngineConfigTo(target) {
    if (!target || !this.engine) {
      return;
    }

    const setter =
      typeof target.$set === "function"
        ? (key, value) => target.$set(target, key, value)
        : (key, value) => {
            target[key] = value;
          };

    const engineConfigData = this.engine.getConfigData();
    Object.keys(engineConfigData).forEach((key) => {
      setter(key, engineConfigData[key]);
    });

    const engineConfigMethods = this.engine.getConfigMethods();
    Object.keys(engineConfigMethods).forEach((methodName) => {
      target[methodName] = engineConfigMethods[methodName].bind(target);
    });
  }

  syncUiStateTo(target) {
    if (!target) {
      return;
    }

    const setter =
      typeof target.$set === "function"
        ? (key, value) => target.$set(target, key, value)
        : (key, value) => {
            target[key] = value;
          };

    const snapshotKeys = [...UI_SYNC_STATE_KEYS, ...UI_SYNC_TO_ONLY_STATE_KEYS];

    snapshotKeys.forEach((key) => {
      setter(key, this[key]);
    });

    this.bindEngineConfigTo(target);
  }

  syncUiStateFrom(target) {
    if (!target) {
      return;
    }

    const snapshotKeys = UI_SYNC_STATE_KEYS;

    snapshotKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        this[key] = target[key];
      }
    });
  }
}

Object.assign(
  TranslationRuntime.prototype,
  translateOnTheFlySettingsMethods,
  translateOnTheFlyCacheMethods,
  translateOnTheFlyUiMethods,
  translateOnTheFlyMessageMethods,
  translateOnTheFlyFlowMethods,
  translateOnTheFlyRuntimeMethods,
  objectTranslationRuntimeMethods,
  translateOnTheFlyCoreMethods,
);

const LOCAL_TRANSLATION_RUNTIME = new TranslationRuntime();

export function getTranslationRuntime() {
  const host = getHostWindow();
  return (
    host.__TranslationRuntime ||
    host.__TranslateRuntime ||
    LOCAL_TRANSLATION_RUNTIME
  );
}

export function ensureTranslationRuntime() {
  const runtime = getTranslationRuntime();
  return runtime.initialize ? runtime.initialize() : runtime;
}

export { LOCAL_TRANSLATION_RUNTIME, TranslationRuntime };
