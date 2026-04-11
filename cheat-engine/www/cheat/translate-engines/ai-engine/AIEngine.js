/**
 * AIEngine - Refactored Orchestrator
 * Coordinates translation pipeline using modular services
 * Main entry point: batchTranslate(items)
 */

import BaseTranslationEngine from '../BaseTranslationEngine.js';
import { TagManager } from './TagManager.js';

import { StreamJsonParser } from './StreamJsonParser.js';
import { StreamGuardrails } from './StreamGuardrails.js';
import { ValidationService } from './ValidationService.js';
import { RetryHandler } from './RetryHandler.js';
import { ApiClient } from './ApiClient.js';
import { ConfigManager } from './ConfigManager.js';
import {
    DEFAULT_SYSTEM_PROMPT,
    TYPE_TO_TAG,
    TAG_BRACKET_OPTIONS,
    TAG_TYPE_OPTIONS,
    TAG_STYLE_OPTIONS,
    buildRequestSettingsForContent,
    REQUEST_CANCEL_REASON,
} from './constants.js';
import { stripThinkBlocks, preprocessPayloadForLlm } from './utils.js';

class AIEngine extends BaseTranslationEngine {
    constructor(panel) {
        super(panel);

        // Configuration properties
        this.provider = 'openApi';
        this.host = 'http://localhost:4891';
        this.apiKey = '';
        this.selectedModel = '';
        this.models = [];
        this.loadingModels = false;
        this.modelsError = '';
        this.allowNewlineMismatch = false;
        this.askAiIfTextTranslated = true;
        this.invalidJsonHandlingStrategy = 'resendFirstHalf';
        this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
        this.useJsonFixer = true;
        this._aiFixRecursionMaxDepth = 0;
        this.customTags = [];
        this.pluginTags = []; // auto-registered by plugin translators, not user-editable
        this.customTagTypeOptions = [...TAG_TYPE_OPTIONS];
        this.customTagBracketOptions = [...TAG_BRACKET_OPTIONS];
        this.customTagStyleOptions = [...TAG_STYLE_OPTIONS];

        // State tracking
        this._activeAbortController = null;
        this._activeRequestMeta = null;
        this._requestQueueTail = Promise.resolve();

        // Initialize services
        this.tagManager = new TagManager(panel);
        this.validationService = new ValidationService(this);
        this.retryHandler = new RetryHandler(this);
        this.apiClient = new ApiClient({
            provider: this.provider,
            host: this.host,
            apiKey: this.apiKey,
        });
        this.configManager = new ConfigManager(this);

        // Property descriptors for panel state sync
        Object.defineProperties(this, {
            aiProvider: {
                get: () => this.provider,
                set: (v) => {
                    this.provider = v === 'gpt4all' ? 'openApi' : v;
                },
            },
            aiHost: {
                get: () => this.host,
                set: (v) => {
                    this.host = v;
                },
            },
            aiApiKey: {
                get: () => this.apiKey,
                set: (v) => {
                    this.apiKey = v;
                },
            },
            aiSelectedModel: {
                get: () => this.selectedModel,
                set: (v) => {
                    this.selectedModel = v;
                },
            },
            aiModels: {
                get: () => this.models,
                set: (v) => {
                    this.models = Array.isArray(v) ? v : [];
                },
            },
            aiLoadingModels: {
                get: () => this.loadingModels,
                set: (v) => {
                    this.loadingModels = !!v;
                },
            },
            aiModelsError: {
                get: () => this.modelsError,
                set: (v) => {
                    this.modelsError = v || '';
                },
            },
            aiAllowNewlineMismatch: {
                get: () => this.allowNewlineMismatch,
                set: (v) => {
                    this.allowNewlineMismatch = !!v;
                    this.tagManager.allowNewlineMismatch = this.allowNewlineMismatch;
                },
            },
            aiAskIfTextTranslated: {
                get: () => this.askAiIfTextTranslated,
                set: (v) => {
                    this.askAiIfTextTranslated = !!v;
                },
            },
            aiInvalidJsonHandlingStrategy: {
                get: () => this.invalidJsonHandlingStrategy,
                set: (v) => {
                    this.invalidJsonHandlingStrategy = v || 'resendFirstHalf';
                },
            },
            aiSystemPrompt: {
                get: () => this.systemPrompt,
                set: (v) => {
                    this.systemPrompt = v || DEFAULT_SYSTEM_PROMPT;
                },
            },
            aiFixRecursionMaxDepth: {
                get: () => this._aiFixRecursionMaxDepth,
                set: (v) => {
                    this._aiFixRecursionMaxDepth = Number(v) || 0;
                },
            },
            aiCustomTags: {
                get: () => this.customTags,
                set: (v) => {
                    this.setCustomTags(v);
                },
            },
            aiCustomTagTypeOptions: {
                get: () => this.customTagTypeOptions,
            },
            aiCustomTagBracketOptions: {
                get: () => this.customTagBracketOptions,
            },
            aiCustomTagStyleOptions: {
                get: () => this.customTagStyleOptions,
            },
            userJsonFixer: {
                get: () => this.useJsonFixer,
                set: (v) => {
                    this.useJsonFixer = !!v;
                },
            },
        });

        this.tagManager.allowNewlineMismatch = this.allowNewlineMismatch;
    }

    normalizeCustomTagConfig(config = {}) {
        const normalized = {
            description: String(config.description || '').trim(),
            type: String(config.type || ''),
            tagSymbol: String(config.tagSymbol || '').trim(),
            requiredConsistency: !!config.requiredConsistency,
            style: config.style === 'xml' ? 'xml' : 'escape',
        };

        if (normalized.type === 'withCustomParameter') {
            normalized.bracket = String(
                config.bracket || (normalized.style === 'xml' ? 'none' : '<')
            );
            normalized.maskValue = !!config.maskValue;
        }

        return normalized;
    }

    /** Merge plugin + user custom tags and push to TagManager. */
    _refreshTagManager() {
        this.tagManager.setCustomTagConfigs([...this.pluginTags, ...this.customTags]);
    }

    setCustomTags(tags) {
        const safeTags = Array.isArray(tags) ? tags : [];
        this.customTags = safeTags.map((tag) => this.normalizeCustomTagConfig(tag));
        this._refreshTagManager();
    }

    /**
     * Register plugin-specific tags. Called automatically from BasePluginTranslator.
     * @param {string} pluginName
     * @param {Array}  tagConfigs
     */
    addPluginTags(pluginName, tagConfigs) {
        const safePluginName = String(pluginName || '_unknown').trim();
        const configs = Array.isArray(tagConfigs) ? tagConfigs : [];

        // Replace any previously registered tags for this plugin
        this.pluginTags = (this.pluginTags || []).filter((t) => t._pluginName !== safePluginName);

        const normalized = configs
            .filter((c) => c && typeof c === 'object' && c.description && c.tagSymbol)
            .map((c) => ({
                ...this.normalizeCustomTagConfig(c),
                _pluginName: safePluginName,
            }));

        this.pluginTags = [...this.pluginTags, ...normalized];
        this._refreshTagManager();
    }

    /**
     * Remove all tags previously registered by a plugin.
     * @param {string} pluginName
     */
    removePluginTags(pluginName) {
        const safePluginName = String(pluginName || '_unknown').trim();
        this.pluginTags = (this.pluginTags || []).filter((t) => t._pluginName !== safePluginName);
        this._refreshTagManager();
    }

    addCustomTag(tagConfig) {
        const next = [...this.customTags, this.normalizeCustomTagConfig(tagConfig)];
        this.setCustomTags(next);
    }

    updateCustomTag(index, tagConfig) {
        const next = [...this.customTags];
        next[index] = this.normalizeCustomTagConfig(tagConfig);
        this.setCustomTags(next);
    }

    removeCustomTag(index) {
        const next = [...this.customTags];
        next.splice(index, 1);
        this.setCustomTags(next);
    }

    getId() {
        return 'openApi';
    }

    getName() {
        return 'AI Engine';
    }

    isFullyConfigured() {
        return !!this.selectedModel;
    }

    static getConfigTemplate() {
        return ConfigManager.getTemplate();
    }

    getConfigData() {
        return this.configManager.getData();
    }

    getConfigMethods() {
        return this.configManager.getMethods();
    }

    getLanguageName(code) {
        const map = {
            ja: 'Japanese',
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            ko: 'Korean',
            'zh-CN': 'Chinese Simplified',
            'zh-TW': 'Chinese Traditional',
            pl: 'Polish',
            auto: 'auto',
        };
        return map[code] || code;
    }

    buildCompactJsonKey(item, fallbackIndex) {
        const safeItem = item || {};
        const rawType = String(safeItem.type || '').toLowerCase();

        // Keep message/speaker/choice compact and sequential as before.
        if (rawType === 'text' || rawType === 'speaker' || rawType === 'choice') {
            return `${TYPE_TO_TAG[rawType] || 'm'}${fallbackIndex}`;
        }

        const match = rawType.match(/^([a-z0-9]+)_(.+)$/);
        if (!match) {
            return `${TYPE_TO_TAG[rawType] || 'm'}${fallbackIndex}`;
        }

        const baseType = match[1];
        const field = match[2];

        const baseMap = {
            item: 'i',
            skill: 's',
            armor: 'a',
            weapon: 'w',
            class: 'c',
            enemy: 'e',
            actor: 'r',
            map: 'mp',
            state: 'st',
        };

        const fieldMap = {
            name: 'n',
            description: 'd',
            note: 't',
            nickname: 'nn',
            profile: 'p',
            message1: 'm1',
            message2: 'm2',
        };

        const shortBase = baseMap[baseType] || baseType.slice(0, 1) || 'x';
        const shortField = fieldMap[field] || field.slice(0, 2) || 'v';

        if (!this._jsonObjectIndexByType) {
            this._jsonObjectIndexByType = new Map();
        }
        if (!this._jsonObjectSequenceByType) {
            this._jsonObjectSequenceByType = new Map();
        }

        let objectKey = String(safeItem.id || '');
        const fieldSuffix = `_${field}`;
        if (objectKey.endsWith(fieldSuffix)) {
            objectKey = objectKey.slice(0, -fieldSuffix.length);
        }
        if (!objectKey) {
            objectKey = `${baseType}:${safeItem.cacheKey || safeItem.value || fallbackIndex}`;
        }

        let byType = this._jsonObjectIndexByType.get(baseType);
        if (!byType) {
            byType = new Map();
            this._jsonObjectIndexByType.set(baseType, byType);
        }

        if (!byType.has(objectKey)) {
            const nextIndex = this._jsonObjectSequenceByType.get(baseType) || 0;
            byType.set(objectKey, nextIndex);
            this._jsonObjectSequenceByType.set(baseType, nextIndex + 1);
        }

        const objectIndex = byType.get(objectKey);
        return `${shortBase}${objectIndex}${shortField}`;
    }

    parseTranslatedMapFromText(text, expectedKeys = []) {
        const merged = StreamJsonParser.mergeTopLevelObjects(text);
        if (merged && typeof merged === 'object') {
            return merged;
        }

        return StreamJsonParser.parseObjectStrict(
            StreamJsonParser.extractBestJsonLike(text, expectedKeys)
        );
    }

    getOfficialNameEnforcementMode() {
        const mode = this.panel?.officialNameEnforcementMode;
        return typeof mode === 'string' ? mode : 'none';
    }

    getOfficialNameEnforcementPattern() {
        const pattern = this.panel?.namePatternForEnforcing;
        return typeof pattern === 'string' && pattern.trim() ? pattern : null;
    }

    collectRegexMatches(text, regex) {
        const matches = [];
        if (typeof text !== 'string' || !(regex instanceof RegExp)) {
            return matches;
        }

        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push(match);
            if (match[0] === '') {
                regex.lastIndex += 1;
            }
        }
        return matches;
    }

    getOfficialNameMap() {
        const sourceLang = this.panel?.sourceLang || 'ja';
        const targetLang = this.panel?.targetLang || 'en';
        const pairKey = `${sourceLang}-${targetLang}`;
        const officialNameMap = new Map();

        const pairProfiles =
            this.panel?.nameProfilesByLangPair &&
            typeof this.panel.nameProfilesByLangPair[pairKey] === 'object'
                ? this.panel.nameProfilesByLangPair[pairKey]
                : {};

        Object.keys(pairProfiles).forEach((originalName) => {
            const profile = pairProfiles[originalName];
            const translation =
                profile && typeof profile.translation === 'string'
                    ? profile.translation.trim()
                    : '';
            if (originalName && translation) {
                officialNameMap.set(originalName, translation);
            }
        });

        if (this.panel?.translationCache instanceof Map) {
            for (const [cacheKey, value] of this.panel.translationCache.entries()) {
                const prefix = `actor_name:${sourceLang}-${targetLang}-`;
                if (!cacheKey.startsWith(prefix)) {
                    continue;
                }

                const originalName = cacheKey.slice(prefix.length);
                const translation = typeof value === 'string' ? value.trim() : '';
                if (originalName && translation && !officialNameMap.has(originalName)) {
                    officialNameMap.set(originalName, translation);
                }
            }
        }

        return officialNameMap;
    }

    replaceFirstMatchedCapture(text, pattern, replacement) {
        const singleMatchRegex = new RegExp(pattern, 'i');
        return text.replace(singleMatchRegex, (fullMatch, captureGroup1) => {
            if (typeof captureGroup1 !== 'string' || !captureGroup1) {
                return fullMatch;
            }
            return fullMatch.replace(captureGroup1, replacement);
        });
    }

    applyOfficialNamesBeforeSending(value) {
        const pattern = this.getOfficialNameEnforcementPattern();
        if (!pattern || typeof value !== 'string' || !value) {
            return value;
        }

        try {
            const regex = new RegExp(pattern, 'gi');
            const matches = this.collectRegexMatches(value, regex);
            if (matches.length !== 1) {
                return value;
            }

            const originalName = matches[0] && typeof matches[0][1] === 'string' ? matches[0][1] : '';
            if (!originalName) {
                return value;
            }

            const officialNameMap = this.getOfficialNameMap();
            const officialTranslation = officialNameMap.get(originalName);
            if (!officialTranslation) {
                return value;
            }

            let nextValue = this.replaceFirstMatchedCapture(value, pattern, officialTranslation);

            if (this.panel?.officialNameEnforcementIncludeAllText) {
                const replacementPairs = Array.from(officialNameMap.entries()).sort(
                    (left, right) => right[0].length - left[0].length,
                );
                for (const [sourceName, translatedName] of replacementPairs) {
                    nextValue = nextValue.split(sourceName).join(translatedName);
                }
            }

            return nextValue;
        } catch (error) {
            console.warn('[AIEngine] Error filling official names before LLM:', error);
            return value;
        }
    }

    /**
     * Main translation orchestrator
     * Coordinates: preprocessing → request → stream monitoring → validation → postprocessing
     */
    async batchTranslate(items, options = {}) {
        if (!Array.isArray(items) || !items.length) {
            return { successes: [], failures: [] };
        }

        const isBackgroundJob = !!(options && options.backgroundJob);

        if (!this.selectedModel) {
            console.warn('[AIEngine] No model selected');
            return {
                successes: [],
                failures: items.map((item) => ({ rejectReason: 'No model selected' })),
            };
        }

        try {
            // 1. PREPROCESS: Tags and payload
            this.tagManager.allowNewlineMismatch = this.allowNewlineMismatch;
            this._jsonObjectIndexByType = new Map();
            this._jsonObjectSequenceByType = new Map();
            const itemData = items.map((item, i) => {
                const originalValue = item.value || '';
                const llmInputValue =
                    this.getOfficialNameEnforcementMode() === 'fill_before_llm'
                        ? this.applyOfficialNamesBeforeSending(originalValue)
                        : originalValue;
                const { preprocessedText, tagCounts, caseMap } = this.tagManager.preprocessTags(
                    llmInputValue
                );
                return {
                    ...item,
                    index: i,
                    jsonKey: this.buildCompactJsonKey(item, i),
                    value: originalValue,
                    llmInputValue,
                    preprocessed: preprocessedText,
                    tagCounts,
                    caseMap,
                };
            });

            const jsonMap = {};
            itemData.forEach((item) => {
                jsonMap[item.jsonKey] = item.preprocessed;
            });

            const nameHints = this.tagManager.buildNameHints();
            const sourceName = this.getLanguageName(this.panel.sourceLang);
            const targetName = this.getLanguageName(this.panel.targetLang);
            const content = JSON.stringify(jsonMap);
            const expectedKeys = Object.keys(jsonMap);

            console.log(
                '[AIEngine] Batch translate items:',
                items.length,
                'JSON keys:',
                expectedKeys.length
            );

            // 2. BUILD REQUEST PAYLOAD
            const payload = {
                model: this.selectedModel,
                messages: [
                    {
                        role: 'system',
                        content: this.systemPrompt,
                    },
                    {
                        role: 'system',
                        content: `Translate video game text from ${sourceName} to ${targetName}. Return only flat one-line JSON object with exactly the same keys as input. No markdown, no comments, no extra keys, no missing keys, no duplicate keys, no arrays, no pretty formatting. Preserve every [b=tag] exactly and keep tag order unchanged. The only exception are tags with <values> like this - [b=na<しえる>]. In this case the <value> can be translated, but otherwise don't modify the tag. Keys with the same prefix+index are context-linked fields of one entity (example: i0n and i0d are the same item's name and description), so translate them consistently. Official name translations, they HAVE to be used for consistency with existing material, don't make up your own translations: ${nameHints}. The names might contain additional info, like gender, in brackets. Use it for additional context.`,
                    },
                    // {
                    //     role: 'user',
                    //     content: `{"${TYPE_TO_TAG.text}0":"[b=na<テスト>]それはいいですね","${TYPE_TO_TAG.text}1":"[b=na<テスト>]情報\\nありがとうございます。"}`,
                    // },
                    // {
                    //     role: 'assistant',
                    //     content: `{"${TYPE_TO_TAG.text}0":"[b=na<Test>]That's great","${TYPE_TO_TAG.text}1":"[b=na<Test>]Thank you for the information"}`,
                    // },
                    {
                        role: 'user',
                        content: `Good. Keep this one-line JSON style and exact keys! Now translate this: ${content}`,
                    },
                ],
                ...buildRequestSettingsForContent(content),
            };

            // 3. REQUEST & STREAM MONITORING
            const streamResult = await this.requestChatCompletion(payload, {
                expectedKeys,
                isBackgroundJob,
            });

            const cancelReason = streamResult.cancelReason || null;
            const preempted = cancelReason === REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED;
            const shouldPreserveCancelReason =
                !!cancelReason &&
                cancelReason !== REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED &&
                cancelReason !== REQUEST_CANCEL_REASON.REQUEST_ABORTED;

            if (!streamResult.text && !streamResult.bestMap) {
                // Keep preemption behavior explicit, but allow guardrail/no-content paths
                // to fall through to retry strategies (e.g. split in half).
                if (preempted || cancelReason === REQUEST_CANCEL_REASON.REQUEST_ABORTED) {
                    console.warn('[AIEngine] Batch returned no content');
                    return {
                        successes: [],
                        failures: items.map((item) => ({
                            ...item,
                            rejectReason: cancelReason || 'No content',
                            cancelReason,
                            preempted,
                        })),
                    };
                }
            }

            let rawTranslated = streamResult.text || '';
            let translatedMap = null;
            let usedStreamFallback = false;

            // 4. PARSE JSON
            const streamPartialMatchedKeys = StreamGuardrails.countMatchedKeys(
                streamResult.bestMap,
                expectedKeys
            );
            const streamBestMapComplete = StreamGuardrails.isMapComplete(
                streamResult.bestMap,
                expectedKeys
            );

            const guardrailPartialMap = !!(
                streamResult.cancelledByGuardrail &&
                streamResult.bestMap &&
                !streamBestMapComplete
            );

            try {
                // Final stream text has priority over any guardrail snapshot.
                translatedMap = this.parseTranslatedMapFromText(rawTranslated, expectedKeys);
            } catch (parseError) {
                console.error('[AIEngine] Failed to parse JSON response:', parseError.message);

                if (streamBestMapComplete && streamResult.bestMap) {
                    translatedMap = streamResult.bestMap;
                    rawTranslated = JSON.stringify(streamResult.bestMap);
                    usedStreamFallback = true;
                } else {
                    // Try stream guardrail partial
                    if (streamPartialMatchedKeys > 0) {
                        translatedMap = streamResult.bestMap;
                        rawTranslated = JSON.stringify(streamResult.bestMap);
                        usedStreamFallback = true;
                    } else {
                        // Retry error handling
                        const retryResult = await this.retryHandler.handleJsonError({
                            strategy: this.invalidJsonHandlingStrategy,
                            originalPayload: payload,
                            previousResponse: rawTranslated,
                            itemData,
                            isBackgroundJob,
                        });

                        if (!retryResult.ok) {
                            return {
                                successes: [],
                                failures: items.map((item) => ({
                                    ...item,
                                    rejectReason: cancelReason || 'Invalid JSON response',
                                    cancelReason: cancelReason || null,
                                    preempted:
                                        cancelReason === REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED,
                                })),
                            };
                        }

                        if (retryResult.merged) {
                            return retryResult.merged;
                        }

                        // Try to parse retry response
                        try {
                            translatedMap = this.parseTranslatedMapFromText(
                                retryResult.response || retryResult.repaired,
                                expectedKeys
                            );
                            rawTranslated =
                                retryResult.response || JSON.stringify(retryResult.repaired);
                        } catch (retryParseError) {
                            console.error(
                                '[AIEngine] Retry parse failed:',
                                retryParseError.message
                            );
                            if (streamPartialMatchedKeys > 0) {
                                translatedMap = streamResult.bestMap;
                                rawTranslated = JSON.stringify(streamResult.bestMap);
                                usedStreamFallback = true;
                            } else {
                                return {
                                    successes: [],
                                    failures: items.map((item) => ({
                                        ...item,
                                        rejectReason: 'Invalid JSON after retry',
                                    })),
                                };
                            }
                        }
                    }
                }
            }

            // 5. VALIDATION
            let shapeCheck = this.validationService.validateTranslatedMapShape(
                translatedMap,
                itemData
            );
            translatedMap = shapeCheck.normalizedMap || translatedMap;

            if (!shapeCheck.valid && !usedStreamFallback && streamPartialMatchedKeys) {
                translatedMap = streamResult.bestMap;
                rawTranslated = JSON.stringify(streamResult.bestMap);
                usedStreamFallback = true;
                shapeCheck = this.validationService.validateTranslatedMapShape(
                    translatedMap,
                    itemData
                );
                translatedMap = shapeCheck.normalizedMap || translatedMap;
            }

            if (!shapeCheck.valid && !guardrailPartialMap && !usedStreamFallback) {
                const retryResult = await this.retryHandler.handleJsonError({
                    strategy: this.invalidJsonHandlingStrategy,
                    originalPayload: payload,
                    previousResponse: rawTranslated,
                    itemData,
                    isBackgroundJob,
                });

                if (retryResult.ok) {
                    if (retryResult.merged) {
                        return retryResult.merged;
                    }

                    try {
                        translatedMap = this.parseTranslatedMapFromText(
                            retryResult.response || retryResult.repaired,
                            expectedKeys
                        );
                        rawTranslated =
                            retryResult.response || JSON.stringify(retryResult.repaired);
                        shapeCheck = this.validationService.validateTranslatedMapShape(
                            translatedMap,
                            itemData
                        );
                        translatedMap = shapeCheck.normalizedMap || translatedMap;
                    } catch (retryParseError) {
                        console.error(
                            '[AIEngine] Retry parse failed after shape error:',
                            retryParseError.message
                        );
                    }
                }

                if (shapeCheck.valid) {
                    // Continue normal post-processing path with repaired response.
                } else {
                    console.warn('[AIEngine] Response JSON has invalid shape:', shapeCheck.errors);
                    return {
                        successes: [],
                        failures: items.map((item, idx) => {
                            const mappedItem = itemData[idx] || item;
                            const missingKeySet = new Set(shapeCheck.missingKeys || []);
                            const nonStringKeySet = new Set(shapeCheck.nonStringKeys || []);
                            const key =
                                mappedItem.jsonKey ||
                                `${TYPE_TO_TAG[mappedItem.type] || mappedItem.type}${mappedItem.index || 0}`;

                            let reason = 'Invalid response shape';
                            if (missingKeySet.has(key)) {
                                reason = 'Missing key';
                            } else if (nonStringKeySet.has(key)) {
                                reason = 'Key is not a string';
                            }

                            return {
                                ...item,
                                rejectReason: reason,
                                cancelReason: shouldPreserveCancelReason ? cancelReason : null,
                            };
                        }),
                    };
                }
            }

            if (!guardrailPartialMap && shapeCheck.valid && this.askAiIfTextTranslated) {
                console.log('[AIEngine] Validating response language...');
                const validationText = this.validationService.buildValidationTextFromMap(
                    translatedMap,
                    itemData
                );
                const langValidation = await this.validationService.validateResponseLanguage(
                    validationText,
                    targetName,
                    sourceName,
                    isBackgroundJob
                );

                if (!langValidation.isTranslated) {
                    console.log('[AIEngine] Language validation failed, retry count limited');
                    // Fail open rather than retry infinitely
                }
            }

            // 6. POSTPROCESS & WRAP
            const successes = [];
            const failures = [];

            for (const itemD of itemData) {
                const key =
                    itemD.jsonKey || `${TYPE_TO_TAG[itemD.type] || itemD.type}${itemD.index}`;
                const rawSlice = translatedMap[key];

                if (rawSlice === undefined || rawSlice === null) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: 'Missing key',
                        cancelReason: shouldPreserveCancelReason ? cancelReason : null,
                    });
                    continue;
                }

                if (typeof rawSlice !== 'string') {
                    failures.push({
                        ...itemD,
                        rejectReason: `Value for "${key}" is not a string`,
                        cancelReason: shouldPreserveCancelReason ? cancelReason : null,
                    });
                    continue;
                }

                // Postprocess tags
                const postprocessResult = this.tagManager.postprocessTags(
                    rawSlice,
                    itemD.tagCounts,
                    itemD.caseMap
                );
                if (!postprocessResult.valid) {
                    failures.push({
                        ...itemD,
                        rejectReason: postprocessResult.errorReason || 'Tag count mismatch',
                        cancelReason: shouldPreserveCancelReason ? cancelReason : null,
                    });
                    continue;
                }

                const finalTranslated = this.postprocessTranslatedItem(
                    itemD,
                    postprocessResult.text
                );

                successes.push({
                    type: itemD.type,
                    id: itemD.id,
                    value: itemD.value,
                    translated: finalTranslated,
                    cacheKey: itemD.cacheKey,
                });
            }

            if (successes.length === 0 && failures.length > 0 && shouldPreserveCancelReason) {
                const retryResult = await this.retryHandler.handleJsonError({
                    strategy: this.invalidJsonHandlingStrategy,
                    originalPayload: payload,
                    previousResponse: rawTranslated,
                    itemData,
                    isBackgroundJob,
                });

                if (retryResult.ok && retryResult.merged) {
                    return retryResult.merged;
                }
            }

            return { successes, failures };
        } catch (error) {
            console.error('[AIEngine] Batch translate error:', error.message);
            return {
                successes: [],
                failures: items.map((item) => ({
                    ...item,
                    rejectReason: error.message,
                })),
            };
        }
    }

    /**
     * Request chat completion with streaming and guardrails
     */
    async requestChatCompletion(payload, options = {}) {
        return this.enqueueRequest(async () => {
            const expectedKeys = options.expectedKeys || [];
            const isBackgroundJob = !!options.isBackgroundJob;

            const controller = new AbortController();
            this._activeAbortController = controller;
            this._activeRequestMeta = { isBackgroundJob, startedAt: Date.now() };

            try {
                // Preprocess payload
                const processedPayload = preprocessPayloadForLlm(payload);
                const preservedFetch =
                    typeof window !== 'undefined' ? window['chromiumFetch'] : undefined;
                const requestFetch = typeof preservedFetch === 'function' ? preservedFetch : fetch;

                const response = await requestFetch(this.getChatUrl(), {
                    method: 'POST',
                    headers: this.getRequestHeaders(),
                    body: JSON.stringify(processedPayload),
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const contentType = (response.headers.get('content-type') || '').toLowerCase();
                const isEventStream = contentType.includes('text/event-stream');

                if (!isEventStream) {
                    const rawBodyText = await response.text();
                    const assistantText = this.extractAssistantTextFromApiResponse(rawBodyText);
                    const { text: cleanedText } = stripThinkBlocks(assistantText);

                    return {
                        text: cleanedText,
                        bestMap: null,
                        cancelledByGuardrail: false,
                        cancelReason: null,
                    };
                }

                // Parse streaming response
                const monitorState = StreamGuardrails.createMonitorState(expectedKeys);
                let contentText = ''; // accumulated assistant content only
                let sseBuffer = ''; // buffer for partial SSE lines

                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    sseBuffer += chunk;

                    // Process complete SSE lines
                    const lines = sseBuffer.split('\n');
                    sseBuffer = lines.pop(); // last element may be incomplete

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed === 'data: [DONE]') continue;
                        if (!trimmed.startsWith('data:')) continue;
                        try {
                            const dataPayload = trimmed.slice(5).trim();
                            if (!dataPayload || dataPayload === '[DONE]') continue;
                            const json = JSON.parse(dataPayload);
                            const delta = json?.choices?.[0]?.delta?.content;
                            if (typeof delta === 'string') {
                                contentText += delta;
                            }
                        } catch (e) {
                            // skip malformed SSE line
                        }
                    }

                    // Check guardrails on accumulated content
                    const guardrailResult = StreamGuardrails.checkGuardrails(
                        monitorState,
                        contentText,
                        false
                    );
                    if (guardrailResult.shouldCancel) {
                        console.warn(
                            '[AIEngine] Stream guardrail triggered:',
                            guardrailResult.cancelReason
                        );
                        controller.abort();
                        break;
                    }
                }

                // Strip think blocks if present
                const { text: cleanedText } = stripThinkBlocks(contentText);

                return {
                    text: cleanedText,
                    bestMap: monitorState.bestMap,
                    cancelledByGuardrail: !!monitorState.cancelReason,
                    cancelReason: monitorState.cancelReason,
                };
            } catch (error) {
                if (error.name === 'AbortError') {
                    const externalCancelReason =
                        this._activeRequestMeta && this._activeRequestMeta.externalCancelReason
                            ? this._activeRequestMeta.externalCancelReason
                            : null;
                    const cancelReason =
                        externalCancelReason ||
                        (isBackgroundJob
                            ? REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED
                            : REQUEST_CANCEL_REASON.REQUEST_ABORTED);
                    return {
                        text: '',
                        bestMap: null,
                        cancelledByGuardrail: true,
                        cancelReason,
                    };
                }
                throw error;
            } finally {
                this._activeAbortController = null;
                this._activeRequestMeta = null;
            }
        });
    }

    enqueueRequest(task) {
        const run = this._requestQueueTail.then(task, task);
        this._requestQueueTail = run.catch(() => {});
        return run;
    }

    getChatUrl() {
        const host = (
            this.host ||
            (this.provider === 'openwebui' ? 'http://localhost:8080' : 'http://localhost:4891')
        ).replace(/\/$/, '');
        return this.provider === 'openwebui'
            ? `${host}/api/chat/completions`
            : `${host}/v1/chat/completions`;
    }

    extractAssistantTextFromApiResponse(rawBodyText) {
        if (typeof rawBodyText !== 'string' || rawBodyText.trim() === '') {
            return '';
        }

        try {
            const parsed = JSON.parse(rawBodyText);

            if (typeof parsed === 'string') {
                return parsed;
            }

            if (!parsed || typeof parsed !== 'object') {
                return rawBodyText;
            }

            if (parsed.message && typeof parsed.message.content === 'string') {
                return parsed.message.content;
            }

            if (typeof parsed.response === 'string') {
                return parsed.response;
            }

            if (typeof parsed.content === 'string') {
                return parsed.content;
            }

            if (typeof parsed.output_text === 'string') {
                return parsed.output_text;
            }

            const firstChoice = parsed && Array.isArray(parsed.choices) ? parsed.choices[0] : null;
            if (firstChoice) {
                const messageContent =
                    firstChoice.message && typeof firstChoice.message.content === 'string'
                        ? firstChoice.message.content
                        : null;
                if (messageContent !== null) {
                    return messageContent;
                }

                const textContent = typeof firstChoice.text === 'string' ? firstChoice.text : null;
                if (textContent !== null) {
                    return textContent;
                }
            }
        } catch (e) {
            // Not a JSON envelope, treat body as direct text response.
        }

        return rawBodyText;
    }

    postprocessTranslatedItem(item, translated) {
        // Call parent postprocessing first
        const baseProcessed = super.postprocessTranslatedItem(item, translated);

        // Enforce official names after tag restoration when regex matches exactly once
        if (
            item &&
            this.getOfficialNameEnforcementMode() === 'fix_matching_regex' &&
            this.getOfficialNameEnforcementPattern()
        ) {
            try {
                const originalValue = item.value;
                const translatedValue = baseProcessed;

                if (typeof originalValue !== 'string' || typeof translatedValue !== 'string') {
                    return baseProcessed;
                }

                const pattern = this.getOfficialNameEnforcementPattern();
                const regex = new RegExp(pattern, 'gi');

                // Find matches in original and translated
                const originalMatches = this.collectRegexMatches(originalValue, regex);
                const translatedMatches = this.collectRegexMatches(translatedValue, regex);

                // Only enforce if both have exactly 1 match
                if (originalMatches.length === 1 && translatedMatches.length === 1) {
                    const origMatch = originalMatches[0];

                    // Get the name from capture group 1 of original
                    const originalName = origMatch[1];
                    if (!originalName) {
                        return baseProcessed;
                    }

                    const officialTranslation = this.getOfficialNameMap().get(originalName);

                    if (officialTranslation) {
                        return this.replaceFirstMatchedCapture(
                            translatedValue,
                            pattern,
                            officialTranslation,
                        );
                    }
                }
            } catch (err) {
                console.warn('[AIEngine] Error enforcing official names:', err);
            }
        }

        return baseProcessed;
    }

    getRequestHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.provider === 'openwebui' && this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        return headers;
    }

    cancelActiveRequest(reason = null) {
        if (reason && this._activeRequestMeta) {
            this._activeRequestMeta.externalCancelReason = reason;
        }

        if (this._activeAbortController) {
            try {
                this._activeAbortController.abort();
                return true;
            } catch (e) {
                console.warn('[AIEngine] Cancel failed:', e.message);
            }
        }
        return false;
    }

    hasActiveBackgroundRequest() {
        return !!(
            this._activeAbortController &&
            this._activeRequestMeta &&
            this._activeRequestMeta.isBackgroundJob
        );
    }

    cancelActiveBackgroundRequest() {
        if (!this.hasActiveBackgroundRequest()) {
            return false;
        }
        return this.cancelActiveRequest(REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED);
    }
}

export default AIEngine;
