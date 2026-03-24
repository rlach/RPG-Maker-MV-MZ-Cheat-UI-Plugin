import { DEFAULT_SYSTEM_PROMPT } from "../../translate-engines/ai-engine/constants.js";

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
  "objectTranslationSelectedMapIds",
  "objectTranslationJob",
  "nonOtfTranslationProcess",
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
    maxLineWidth: 60,
    descriptionMaxLineWidth: 59,
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
