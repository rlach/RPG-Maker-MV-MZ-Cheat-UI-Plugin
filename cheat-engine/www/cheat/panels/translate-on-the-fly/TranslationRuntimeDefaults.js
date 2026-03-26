import { DEFAULT_SYSTEM_PROMPT } from "../../translate-engines/ai-engine/constants.js";
import { isRpgMakerMv } from "../../js/RpgMakerRuntime.js";

export const LANGUAGE_OPTIONS = [
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

export const AI_PROVIDER_OPTIONS = [
  { text: "OpenAPI compatible", value: "openApi" },
  { text: "Open WebUI", value: "openwebui" },
];

export const AI_INVALID_JSON_HANDLING_STRATEGY_OPTIONS = [
  { text: "Split into two half-batches", value: "resendFirstHalf" },
  { text: "Ask AI to fix it", value: "askAIToFix" },
  { text: "Use JsonFixer", value: "useJsonFixer" },
  { text: "None", value: "none" },
];

export const DEFAULT_DIALOG_MAX_LINE_WIDTH_MV = 52;
export const DEFAULT_DIALOG_MAX_LINE_WIDTH_MZ = 60;
export const DEFAULT_DESCRIPTION_MAX_LINE_WIDTH = 59;

export function getDefaultDialogMaxLineWidth() {
  return isRpgMakerMv()
    ? DEFAULT_DIALOG_MAX_LINE_WIDTH_MV
    : DEFAULT_DIALOG_MAX_LINE_WIDTH_MZ;
}

export const TRANSLATION_RUNTIME_STATE_KEYS = Object.freeze([
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
  "spinnerActiveCount",
  "translationEngineOptions",
  "engineSettings",
  "engine",
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
  "aiCustomTags",
  "aiCustomTagTypeOptions",
  "aiCustomTagBracketOptions",
  "objectTranslationSelectedMapIds",
  "objectTranslationJob",
  "nonOtfTranslationProcess",
]);

export const PERSISTED_TRANSLATION_SETTINGS_KEYS = Object.freeze([
  "enabled",
  "sourceLang",
  "targetLang",
  "translationCount",
  "enableTextWrapping",
  "maxLineWidth",
  "descriptionMaxLineWidth",
  "charLimit",
  "batchItemsLimit",
  "translationEngine",
  "translateCacheWhenDisabled",
  "tryTranslateAhead",
  "translateGameObjects",
  "cancelBackgroundForOnTheFly",
  "engineSettings",
]);

export const UI_SYNC_STATE_KEYS = Object.freeze([
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
  "aiCustomTags",
  "aiCustomTagTypeOptions",
  "aiCustomTagBracketOptions",
  "objectTranslationSelectedMapIds",
]);

export const UI_SYNC_TO_ONLY_STATE_KEYS = Object.freeze([
  "translationEngineOptions",
  "languageOptions",
  "aiProviderOptions",
  "aiInvalidJsonHandlingStrategyOptions",
  "aiCustomTagTypeOptions",
  "aiCustomTagBracketOptions",
]);

const cloneOptions = (items) =>
  Array.isArray(items)
    ? items.map((item) => {
        if (!item || typeof item !== "object") {
          return item;
        }
        return { ...item };
      })
    : [];

export function createTranslationRuntimeStateDefaults(engineOptions = []) {
  return {
    enabled: false,
    sourceLang: "ja",
    targetLang: "en",
    translationCount: 0,
    enableTextWrapping: true,
    maxLineWidth: getDefaultDialogMaxLineWidth(),
    descriptionMaxLineWidth: DEFAULT_DESCRIPTION_MAX_LINE_WIDTH,
    translationEngine: "mymemory",
    translateCacheWhenDisabled: false,
    tryTranslateAhead: true,
    translateGameObjects: true,
    cancelBackgroundForOnTheFly: false,
    charLimit: 1000,
    batchItemsLimit: 20,
    spinnerActiveCount: 0,
    translationEngineOptions: cloneOptions(engineOptions),
    engineSettings: {},
    engine: null,
    languageOptions: cloneOptions(LANGUAGE_OPTIONS),
    libreTranslateHost: "http://127.0.0.1:5000",
    libreTranslateApiKey: "",
    aiProvider: "openApi",
    aiProviderOptions: cloneOptions(AI_PROVIDER_OPTIONS),
    aiHost: "http://localhost:4891",
    aiApiKey: "",
    aiSelectedModel: "",
    aiModels: [],
    aiLoadingModels: false,
    aiModelsError: "",
    aiAllowNewlineMismatch: false,
    aiAskIfTextTranslated: true,
    aiInvalidJsonHandlingStrategy: "resendFirstHalf",
    aiInvalidJsonHandlingStrategyOptions: cloneOptions(
      AI_INVALID_JSON_HANDLING_STRATEGY_OPTIONS,
    ),
    aiSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    currentMessageWindow: null,
    currentGameMessage: null,
    useJsonFixer: true,
    aiFixRecursionMaxDepth: 0,
    aiCustomTags: [],
    aiCustomTagTypeOptions: [],
    aiCustomTagBracketOptions: [],
    objectTranslationSelectedMapIds: null,
    objectTranslationJob: {
      active: false,
      currentTypeLabel: "",
      currentDone: 0,
      currentTotal: 0,
      totalDone: 0,
      totalTarget: 0,
      runErrors: 0,
    },
    nonOtfTranslationProcess: {
      active: false,
      label: "",
      startedAt: 0,
    },
  };
}

export function createPersistedTranslationSettingsDefaults() {
  const runtimeDefaults = createTranslationRuntimeStateDefaults([]);
  const defaults = {};
  PERSISTED_TRANSLATION_SETTINGS_KEYS.forEach((key) => {
    defaults[key] = runtimeDefaults[key];
  });
  defaults.engineSettings = {};
  return defaults;
}

export function normalizePersistedTranslationSettings(rawData = {}) {
  const defaults = createPersistedTranslationSettingsDefaults();
  const data = rawData && typeof rawData === "object" ? rawData : {};
  const normalized = Object.assign({}, defaults, data);

  const savedEngine =
    normalized.translationEngine || defaults.translationEngine;
  normalized.translationEngine =
    savedEngine === "gpt4all" ? "openApi" : savedEngine;

  if (
    !normalized.engineSettings ||
    typeof normalized.engineSettings !== "object"
  ) {
    normalized.engineSettings = {};
  }
  if (normalized.engineSettings.gpt4all && !normalized.engineSettings.openApi) {
    normalized.engineSettings.openApi = normalized.engineSettings.gpt4all;
    delete normalized.engineSettings.gpt4all;
  }

  return normalized;
}

export function serializePersistedTranslationSettings(state) {
  const normalized = normalizePersistedTranslationSettings(state);
  const serialized = {};
  PERSISTED_TRANSLATION_SETTINGS_KEYS.forEach((key) => {
    serialized[key] = normalized[key];
  });
  return serialized;
}
