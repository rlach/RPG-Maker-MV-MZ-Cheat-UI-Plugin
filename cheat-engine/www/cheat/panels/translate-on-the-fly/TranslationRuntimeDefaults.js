import {
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_BANNED_PHRASES_TEXT,
} from '../../translate-engines/ai-engine/constants.js';
import { isRpgMakerMv } from '../../js/RpgMakerRuntime.js';

export const LANGUAGE_OPTIONS = [
    { text: 'English', value: 'en' },
    { text: 'Japanese (日本語)', value: 'ja' },
    { text: 'Spanish (Español)', value: 'es' },
    { text: 'French (Français)', value: 'fr' },
    { text: 'German (Deutsch)', value: 'de' },
    { text: 'Italian (Italiano)', value: 'it' },
    { text: 'Portuguese (Português)', value: 'pt' },
    { text: 'Russian (Русский)', value: 'ru' },
    { text: 'Korean (한국어)', value: 'ko' },
    { text: 'Chinese Simplified (简体中文)', value: 'zh-CN' },
    { text: 'Chinese Traditional (繁體中文)', value: 'zh-TW' },
    { text: 'Polish (Polski)', value: 'pl' },
];

export const AI_PROVIDER_OPTIONS = [
    { text: 'OpenAPI compatible', value: 'openApi' },
    { text: 'Open WebUI', value: 'openwebui' },
];

export const AI_INVALID_JSON_HANDLING_STRATEGY_OPTIONS = [
    { text: 'Split into two half-batches', value: 'resendFirstHalf' },
    { text: 'Resend X times', value: 'resendXTimes' },
    { text: 'Ask AI to fix it', value: 'askAIToFix' },
    { text: 'Use JsonFixer', value: 'useJsonFixer' },
    { text: 'None', value: 'none' },
];

export const DEFAULT_DIALOG_MAX_LINE_WIDTH_MV = 52;
export const DEFAULT_DIALOG_MAX_LINE_WIDTH_MZ = 60;
export const DEFAULT_DIALOG_MAX_LINE_WIDTH_WITH_PORTRAIT_MV = 44;
export const DEFAULT_DIALOG_MAX_LINE_WIDTH_WITH_PORTRAIT_MZ = 50;
export const DEFAULT_DESCRIPTION_MAX_LINE_WIDTH_MV = 53;
export const DEFAULT_DESCRIPTION_MAX_LINE_WIDTH_MZ = 59;
export const DEFAULT_TEXT_WRAP_FONT_SCALE_MULTIPLIER = 0.69;

export function getDefaultDialogMaxLineWidth() {
    return isRpgMakerMv() ? DEFAULT_DIALOG_MAX_LINE_WIDTH_MV : DEFAULT_DIALOG_MAX_LINE_WIDTH_MZ;
}

export function getDefaultDescriptionMaxLineWidth() {
    return isRpgMakerMv()
        ? DEFAULT_DESCRIPTION_MAX_LINE_WIDTH_MV
        : DEFAULT_DESCRIPTION_MAX_LINE_WIDTH_MZ;
}

export function getDefaultDialogMaxLineWidthWithPortrait() {
    return isRpgMakerMv()
        ? DEFAULT_DIALOG_MAX_LINE_WIDTH_WITH_PORTRAIT_MV
        : DEFAULT_DIALOG_MAX_LINE_WIDTH_WITH_PORTRAIT_MZ;
}

export const TRANSLATION_RUNTIME_STATE_KEYS = Object.freeze([
    'enabled',
    'sourceLang',
    'targetLang',
    'translationCount',
    'enableTextWrapping',
    'maxLineWidth',
    'maxLineWidthWithPortrait',
    'descriptionMaxLineWidth',
    'textWrapFontScaleMultiplier',
    'translationEngine',
    'translateCacheWhenDisabled',
    'translateImagesInCacheIfAny',
    'tryTranslateAhead',
    'translateGameObjects',
    'cancelBackgroundForOnTheFly',
    'changeToCurrentMapInMassTranslationMidPhase',
    'flatProgressWindow',
    'charLimit',
    'batchItemsLimit',
    'spinnerActiveCount',
    'translationEngineOptions',
    'engineSettings',
    'engine',
    'languageOptions',
    'libreTranslateHost',
    'libreTranslateApiKey',
    'aiProvider',
    'aiProviderOptions',
    'aiHost',
    'aiApiKey',
    'aiSelectedModel',
    'aiModels',
    'aiLoadingModels',
    'aiModelsError',
    'aiAllowNewlineMismatch',
    'aiAskIfTextTranslated',
    'aiInvalidJsonHandlingStrategy',
    'aiInvalidJsonHandlingStrategyOptions',
    'aiInvalidJsonResendCount',
    'aiLengthMultiplierForMaxLength',
    'aiMinimumMaxLength',
    'aiBannedPhrases',
    'aiSystemPrompt',
    'currentMessageWindow',
    'currentGameMessage',
    'useJsonFixer',
    'aiFixRecursionMaxDepth',
    'aiCustomTags',
    'aiCustomTagTypeOptions',
    'aiCustomTagBracketOptions',
    'aiCustomTagStyleOptions',
    'objectTranslationSelectedMapIds',
    'objectTranslationTypeOrder',
    'enabledPluginTranslators',
    'nameProfilesByLangPair',
    'namePatternForEnforcing',
    'officialNameEnforcementMode',
    'officialNameEnforcementIncludeAllText',
    'objectTranslationJob',
    'batchThroughputSamples',
    'queueCompletionScope',
    'dryRunExecutedAtLeastOnce',
    'cacheEmptyStringsRepeatUntilSuccess',
    'nonOtfTranslationProcess',
    'askLlmToAddToKnowledge',
]);

export const PERSISTED_TRANSLATION_SETTINGS_KEYS = Object.freeze([
    'enabled',
    'sourceLang',
    'targetLang',
    'translationCount',
    'enableTextWrapping',
    'maxLineWidth',
    'maxLineWidthWithPortrait',
    'descriptionMaxLineWidth',
    'textWrapFontScaleMultiplier',
    'charLimit',
    'batchItemsLimit',
    'translationEngine',
    'translateCacheWhenDisabled',
    'translateImagesInCacheIfAny',
    'tryTranslateAhead',
    'translateGameObjects',
    'cancelBackgroundForOnTheFly',
    'changeToCurrentMapInMassTranslationMidPhase',
    'flatProgressWindow',
    'engineSettings',
    'objectTranslationTypeOrder',
    'enabledPluginTranslators',
    'nameProfilesByLangPair',
    'namePatternForEnforcing',
    'officialNameEnforcementMode',
    'officialNameEnforcementIncludeAllText',
    'dryRunExecutedAtLeastOnce',
    'cacheEmptyStringsRepeatUntilSuccess',
    'askLlmToAddToKnowledge',
]);

export const UI_SYNC_STATE_KEYS = Object.freeze([
    'enabled',
    'sourceLang',
    'targetLang',
    'translationCount',
    'enableTextWrapping',
    'maxLineWidth',
    'maxLineWidthWithPortrait',
    'descriptionMaxLineWidth',
    'textWrapFontScaleMultiplier',
    'translationEngine',
    'translateCacheWhenDisabled',
    'translateImagesInCacheIfAny',
    'tryTranslateAhead',
    'translateGameObjects',
    'cancelBackgroundForOnTheFly',
    'changeToCurrentMapInMassTranslationMidPhase',
    'flatProgressWindow',
    'charLimit',
    'batchItemsLimit',
    'libreTranslateHost',
    'libreTranslateApiKey',
    'aiProvider',
    'aiHost',
    'aiApiKey',
    'aiSelectedModel',
    'aiModels',
    'aiLoadingModels',
    'aiModelsError',
    'aiAllowNewlineMismatch',
    'aiAskIfTextTranslated',
    'aiInvalidJsonHandlingStrategy',
    'aiInvalidJsonResendCount',
    'aiLengthMultiplierForMaxLength',
    'aiMinimumMaxLength',
    'aiBannedPhrases',
    'aiSystemPrompt',
    'currentMessageWindow',
    'currentGameMessage',
    'useJsonFixer',
    'aiFixRecursionMaxDepth',
    'aiCustomTags',
    'aiCustomTagTypeOptions',
    'aiCustomTagBracketOptions',
    'aiCustomTagStyleOptions',
    'objectTranslationSelectedMapIds',
    'objectTranslationTypeOrder',
    'enabledPluginTranslators',
    'askLlmToAddToKnowledge',
]);

export const UI_SYNC_TO_ONLY_STATE_KEYS = Object.freeze([
    'translationEngineOptions',
    'languageOptions',
    'aiProviderOptions',
    'aiInvalidJsonHandlingStrategyOptions',
    'aiCustomTagTypeOptions',
    'aiCustomTagBracketOptions',
    'aiCustomTagStyleOptions',
]);

const cloneOptions = (items) =>
    Array.isArray(items)
        ? items.map((item) => {
              if (!item || typeof item !== 'object') {
                  return item;
              }
              return { ...item };
          })
        : [];

export function createTranslationRuntimeStateDefaults(engineOptions = []) {
    return {
        enabled: false,
        sourceLang: 'ja',
        targetLang: 'en',
        translationCount: 0,
        enableTextWrapping: true,
        maxLineWidth: getDefaultDialogMaxLineWidth(),
        maxLineWidthWithPortrait: getDefaultDialogMaxLineWidthWithPortrait(),
        descriptionMaxLineWidth: getDefaultDescriptionMaxLineWidth(),
        textWrapFontScaleMultiplier: DEFAULT_TEXT_WRAP_FONT_SCALE_MULTIPLIER,
        translationEngine: 'mymemory',
        translateCacheWhenDisabled: false,
        translateImagesInCacheIfAny: true,
        tryTranslateAhead: true,
        translateGameObjects: true,
        cancelBackgroundForOnTheFly: false,
        changeToCurrentMapInMassTranslationMidPhase: false,
        flatProgressWindow: false,
        charLimit: 1000,
        batchItemsLimit: 20,
        spinnerActiveCount: 0,
        translationEngineOptions: cloneOptions(engineOptions),
        engineSettings: {},
        engine: null,
        languageOptions: cloneOptions(LANGUAGE_OPTIONS),
        libreTranslateHost: 'http://127.0.0.1:5000',
        libreTranslateApiKey: '',
        aiProvider: 'openApi',
        aiProviderOptions: cloneOptions(AI_PROVIDER_OPTIONS),
        aiHost: 'http://localhost:4891',
        aiApiKey: '',
        aiSelectedModel: '',
        aiModels: [],
        aiLoadingModels: false,
        aiModelsError: '',
        aiAllowNewlineMismatch: false,
        aiAskIfTextTranslated: true,
        aiInvalidJsonHandlingStrategy: 'resendFirstHalf',
        aiInvalidJsonHandlingStrategyOptions: cloneOptions(
            AI_INVALID_JSON_HANDLING_STRATEGY_OPTIONS
        ),
        aiInvalidJsonResendCount: 3,
        aiLengthMultiplierForMaxLength: 5,
        aiMinimumMaxLength: 30,
        aiBannedPhrases: DEFAULT_BANNED_PHRASES_TEXT,
        aiSystemPrompt: DEFAULT_SYSTEM_PROMPT,
        currentMessageWindow: null,
        currentGameMessage: null,
        useJsonFixer: true,
        aiFixRecursionMaxDepth: 0,
        aiCustomTags: [],
        aiCustomTagTypeOptions: [],
        aiCustomTagBracketOptions: [],
        aiCustomTagStyleOptions: [],
        safeVariableTranslationIds: [],
        objectTranslationSelectedMapIds: null,
        objectTranslationTypeOrder: [],
        enabledPluginTranslators: {},
        nameProfilesByLangPair: {},
        namePatternForEnforcing: '\\\\n\\<([^<>]+)\\>',
        officialNameEnforcementMode: 'none',
        officialNameEnforcementIncludeAllText: false,
        objectTranslationJob: {
            active: false,
            currentTypeLabel: '',
            currentDone: 0,
            currentTotal: 0,
            totalDone: 0,
            totalTarget: 0,
            runErrors: 0,
        },
        batchThroughputSamples: [],
        queueCompletionScope: null,
        dryRunExecutedAtLeastOnce: false,
        cacheEmptyStringsRepeatUntilSuccess: false,
        askLlmToAddToKnowledge: true,
        nonOtfTranslationProcess: {
            active: false,
            label: '',
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
    const data = rawData && typeof rawData === 'object' ? rawData : {};
    const normalized = Object.assign({}, defaults, data);

    const savedEngine = normalized.translationEngine || defaults.translationEngine;
    normalized.translationEngine = savedEngine === 'gpt4all' ? 'openApi' : savedEngine;

    if (!normalized.engineSettings || typeof normalized.engineSettings !== 'object') {
        normalized.engineSettings = {};
    }

    Object.keys(normalized.engineSettings).forEach((engineId) => {
        const engineConfig = normalized.engineSettings[engineId];
        if (!engineConfig || typeof engineConfig !== 'object') {
            return;
        }
        if (Object.prototype.hasOwnProperty.call(engineConfig, 'aiApiKey')) {
            delete engineConfig.aiApiKey;
        }
    });

    if (normalized.engineSettings.gpt4all && !normalized.engineSettings.openApi) {
        normalized.engineSettings.openApi = normalized.engineSettings.gpt4all;
        delete normalized.engineSettings.gpt4all;
    }

    const validOfficialNameModes = new Set(['none', 'fix_matching_regex', 'fill_before_llm']);
    if (!validOfficialNameModes.has(normalized.officialNameEnforcementMode)) {
        normalized.officialNameEnforcementMode = defaults.officialNameEnforcementMode;
    }
    normalized.officialNameEnforcementIncludeAllText =
        typeof normalized.officialNameEnforcementIncludeAllText === 'boolean'
            ? normalized.officialNameEnforcementIncludeAllText
            : defaults.officialNameEnforcementIncludeAllText;

    const parsedTextWrapMultiplier = Number(
        typeof normalized.textWrapFontScaleMultiplier === 'string'
            ? normalized.textWrapFontScaleMultiplier.replace(',', '.')
            : normalized.textWrapFontScaleMultiplier
    );
    normalized.textWrapFontScaleMultiplier =
        Number.isFinite(parsedTextWrapMultiplier) && parsedTextWrapMultiplier > 0
            ? parsedTextWrapMultiplier
            : defaults.textWrapFontScaleMultiplier;

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
