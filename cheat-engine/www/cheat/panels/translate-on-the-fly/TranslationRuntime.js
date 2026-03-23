import { KeyValueStorage } from "../../js/KeyValueStorage.js";
import { TranslateOnTheFlyState } from "../../js/TranslateOnTheFlyState.js";
import { ensureTranslateCacheRuntime } from "../../js/TranslateCacheRuntime.js";
import {
  createEngine,
  getAvailableEngines,
} from "../../translate-engines/index.js";
import { TranslationBatchManager } from "../../translate-engines/batch-manager/TranslationBatchManager.js";
import { translateOnTheFlySettingsMethods } from "./TranslateOnTheFlySettingsMethods.js";
import { translateOnTheFlyCacheMethods } from "./TranslateOnTheFlyCacheMethods.js";
import { translateOnTheFlyUiMethods } from "./TranslateOnTheFlyUiMethods.js";
import { translateOnTheFlyMessageMethods } from "./TranslateOnTheFlyMessageMethods.js";
import { translateOnTheFlyFlowMethods } from "./TranslateOnTheFlyFlowMethods.js";
import { translateOnTheFlyRuntimeMethods } from "./TranslateOnTheFlyRuntimeMethods.js";
import { objectTranslationRuntimeMethods } from "./ObjectTranslationModalMethods.js";
import { translateOnTheFlyCoreMethods } from "./TranslateOnTheFlyCoreMethods.js";

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

    this.enabled = false;
    this.sourceLang = "ja";
    this.targetLang = "en";
    this.translationCount = 0;
    this.enableTextWrapping = true;
    this.maxLineWidth = 60;
    this.descriptionMaxLineWidth = 59;
    this.translationEngine = "mymemory";
    this.translateCacheWhenDisabled = false;
    this.tryTranslateAhead = true;
    this.translateGameObjects = true;
    this.cancelBackgroundForOnTheFly = false;
    this.charLimit = 1000;
    this.batchItemsLimit = 20;
    this.spinnerActiveCount = 0;
    this.translationEngineOptions = engineOptions;
    this.engineSettings = {};
    this.engine = null;
    this.languageOptions = [
      { text: "English", value: "en" },
      { text: "Japanese (日本語)", value: "ja" },
      { text: "Spanish (Español)", value: "es" },
      { text: "French (Français)", value: "fr" },
      { text: "German (Deutsch)", value: "de" },
      { text: "Italian (Italiano)", value: "it" },
      { text: "Portuguese (Português)", value: "pt" },
      { text: "Russian (Русский)", value: "ru" },
      { text: "Korean (한국어)", value: "ko" },
      { text: "Chinese Simplified (简体中文)", value: "zh-CN" },
      { text: "Chinese Traditional (繁體中文)", value: "zh-TW" },
      { text: "Polish (Polski)", value: "pl" },
    ];
    this.libreTranslateHost = "http://127.0.0.1:5000";
    this.libreTranslateApiKey = "";
    this.aiProvider = "openApi";
    this.aiProviderOptions = [
      { text: "OpenAPI compatible", value: "openApi" },
      { text: "Open WebUI", value: "openwebui" },
    ];
    this.aiHost = "http://localhost:4891";
    this.aiApiKey = "";
    this.aiSelectedModel = "";
    this.aiModels = [];
    this.aiLoadingModels = false;
    this.aiModelsError = "";
    this.aiAllowNewlineMismatch = false;
    this.aiAskIfTextTranslated = true;
    this.aiInvalidJsonHandlingStrategy = "resendFirstHalf";
    this.aiInvalidJsonHandlingStrategyOptions = [
      { text: "Split into two half-batches", value: "resendFirstHalf" },
      { text: "Ask AI to fix it", value: "askAIToFix" },
      { text: "Use JsonFixer", value: "useJsonFixer" },
      { text: "None", value: "none" },
    ];
    this.aiSystemPrompt =
      "You are translating scripts that contain [[tags]]. Altering contents or order of any such tags, removing or adding tags will break the script. DO NOT REMOVE OR ADD ANY TAGS. Only translate the text, do not comment or add anything else. Do not bold, DO NOT FORMAT THE RESPONSE, RETURN IT ALL IN ONE LINE";
    this.currentMessageWindow = null;
    this.currentGameMessage = null;
    this.useJsonFixer = true;
    this.aiFixRecursionMaxDepth = 0;
    this.objectTranslationSelectedMapIds = null;
    this.objectTranslationJob = {
      active: false,
      currentTypeLabel: "",
      currentDone: 0,
      currentTotal: 0,
      totalDone: 0,
      totalTarget: 0,
      runErrors: 0,
    };
  }

  initialize() {
    if (this._initialized) {
      return this;
    }

    this.kvStorage = new KeyValueStorage(
      "./www/cheat-settings/translate-on-the-fly.json",
    );
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
    this.batchManager = new TranslationBatchManager(this);

    if (this.engineSettings && this.engineSettings[this.translationEngine]) {
      const engineConfig = this.engineSettings[this.translationEngine];
      Object.assign(this.engine, engineConfig);
    }

    this.bindEngineConfigTo(this);
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

    const snapshotKeys = [
      "enabled",
      "sourceLang",
      "targetLang",
      "translationCount",
      "enableTextWrapping",
      "maxLineWidth",
      "descriptionMaxLineWidth",
      "translationEngine",
      "translateCacheWhenDisabled",
      "tryTranslateAhead",
      "translateGameObjects",
      "cancelBackgroundForOnTheFly",
      "charLimit",
      "batchItemsLimit",
      "translationEngineOptions",
      "languageOptions",
      "libreTranslateHost",
      "libreTranslateApiKey",
      "aiProvider",
      "aiProviderOptions",
      "aiHost",
      "aiApiKey",
      "aiSelectedModel",
      "aiModels",
      "aiLoadingModels",
      "aiModelsError",
      "aiAllowNewlineMismatch",
      "aiAskIfTextTranslated",
      "aiInvalidJsonHandlingStrategy",
      "aiInvalidJsonHandlingStrategyOptions",
      "aiSystemPrompt",
      "currentMessageWindow",
      "currentGameMessage",
      "useJsonFixer",
      "aiFixRecursionMaxDepth",
      "objectTranslationSelectedMapIds",
    ];

    snapshotKeys.forEach((key) => {
      setter(key, this[key]);
    });

    this.bindEngineConfigTo(target);
  }

  syncUiStateFrom(target) {
    if (!target) {
      return;
    }

    const snapshotKeys = [
      "enabled",
      "sourceLang",
      "targetLang",
      "translationCount",
      "enableTextWrapping",
      "maxLineWidth",
      "descriptionMaxLineWidth",
      "translationEngine",
      "translateCacheWhenDisabled",
      "tryTranslateAhead",
      "translateGameObjects",
      "cancelBackgroundForOnTheFly",
      "charLimit",
      "batchItemsLimit",
      "libreTranslateHost",
      "libreTranslateApiKey",
      "aiProvider",
      "aiHost",
      "aiApiKey",
      "aiSelectedModel",
      "aiModels",
      "aiLoadingModels",
      "aiModelsError",
      "aiAllowNewlineMismatch",
      "aiAskIfTextTranslated",
      "aiInvalidJsonHandlingStrategy",
      "aiSystemPrompt",
      "currentMessageWindow",
      "currentGameMessage",
      "useJsonFixer",
      "aiFixRecursionMaxDepth",
      "objectTranslationSelectedMapIds",
    ];

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
