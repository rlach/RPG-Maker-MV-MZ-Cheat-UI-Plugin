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
    DEFAULT_BANNED_PHRASES_TEXT,
    TYPE_TO_TAG,
    TAG_CONFIGS,
    TAG_BRACKET_OPTIONS,
    TAG_TYPE_OPTIONS,
    TAG_STYLE_OPTIONS,
    buildRequestSettingsForContent,
    REQUEST_CANCEL_REASON,
} from './constants.js';
import { stripThinkBlocks, preprocessPayloadForLlm } from './utils.js';
import {
    findRelevantEntries,
    buildKnowledgeHints,
    buildKbaseInstruction,
    extractKbaseEntries,
    stripKbaseFromMap,
} from '../../js/KnowledgeBase.js';
import {
    getKnowledgeEntries,
    mergeKnowledgeEntries,
    ensureKnowledgeForLangPair,
} from '../../js/KnowledgeBaseRuntime.js';

class AIEngine extends BaseTranslationEngine {
    constructor(runtime) {
        super(runtime);

        // Configuration properties
        this.provider = 'openApi';
        this.host = 'http://localhost:5001';
        this.apiKey = '';
        this.selectedModel = '';
        this.models = [];
        this.loadingModels = false;
        this.modelsError = '';
        this.allowNewlineMismatch = false;
        this.askAiIfTextTranslated = true;
        this.invalidJsonHandlingStrategy = 'resendFirstHalf';
        this._aiInvalidJsonResendCount = 3;
        this.lengthMultiplierForMaxLength = 5;
        this.minimumMaxLength = 30;
        this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
        this.useJsonFixer = true;
        this.bannedPhrasesText = DEFAULT_BANNED_PHRASES_TEXT;
        this._aiFixRecursionMaxDepth = 0;
        this.customTags = [];
        this.pluginTags = []; // auto-registered by plugin translators, not user-editable
        this.tagReservedWidthOverrides = {};
        this.customTagTypeOptions = [...TAG_TYPE_OPTIONS];
        this.customTagBracketOptions = [...TAG_BRACKET_OPTIONS];
        this.customTagStyleOptions = [...TAG_STYLE_OPTIONS];

        // State tracking
        this._activeAbortController = null;
        this._activeRequestMeta = null;
        this._requestQueueTail = Promise.resolve();

        // Initialize services
        this.tagManager = new TagManager(runtime);
        this.validationService = new ValidationService(this);
        this.retryHandler = new RetryHandler(this);
        this.apiClient = new ApiClient({
            provider: this.provider,
            host: this.host,
            apiKey: this.apiKey,
        });
        this.configManager = new ConfigManager(this);

        // Property descriptors for runtime state sync
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
            aiInvalidJsonResendCount: {
                get: () => this._aiInvalidJsonResendCount,
                set: (v) => {
                    const nextValue = Number(v);
                    this._aiInvalidJsonResendCount = Number.isFinite(nextValue)
                        ? Math.max(1, Math.floor(nextValue))
                        : 3;
                },
            },
            aiLengthMultiplierForMaxLength: {
                get: () => this.lengthMultiplierForMaxLength,
                set: (v) => {
                    const nextValue = Number(v);
                    this.lengthMultiplierForMaxLength =
                        Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 3;
                },
            },
            aiMinimumMaxLength: {
                get: () => this.minimumMaxLength,
                set: (v) => {
                    const nextValue = Number(v);
                    this.minimumMaxLength =
                        Number.isFinite(nextValue) && nextValue > 0
                            ? Math.max(1, Math.floor(nextValue))
                            : 30;
                },
            },
            aiSystemPrompt: {
                get: () => this.systemPrompt,
                set: (v) => {
                    this.systemPrompt = v || DEFAULT_SYSTEM_PROMPT;
                },
            },
            aiBannedPhrases: {
                get: () => this.bannedPhrasesText,
                set: (v) => {
                    this.bannedPhrasesText = this.normalizeBannedPhrasesText(v);
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
            aiTagReservedWidthOverrides: {
                get: () => this.tagReservedWidthOverrides,
                set: (v) => {
                    this.setTagReservedWidthOverrides(v);
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

    normalizeBannedPhrasesText(input) {
        if (input === undefined || input === null) {
            return '';
        }

        const raw = Array.isArray(input) ? input.join('\n') : String(input);
        const lines = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        const deduped = [];
        const seen = new Set();

        for (const phrase of lines) {
            const normalized = phrase.toLowerCase();
            if (seen.has(normalized)) {
                continue;
            }
            seen.add(normalized);
            deduped.push(phrase);
        }

        return deduped.join('\n');
    }

    getBannedPhrasesList() {
        return this.normalizeBannedPhrasesText(this.bannedPhrasesText)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
    }

    findFirstBannedPhrase(text, bannedPhrases = this.getBannedPhrasesList()) {
        if (typeof text !== 'string' || !text || !Array.isArray(bannedPhrases)) {
            return null;
        }

        const lower = text.toLowerCase();
        for (const phrase of bannedPhrases) {
            if (typeof phrase !== 'string') {
                continue;
            }
            const normalized = phrase.trim();
            if (!normalized) {
                continue;
            }
            if (lower.includes(normalized.toLowerCase())) {
                return normalized;
            }
        }

        return null;
    }

    normalizeCustomTagConfig(config = {}) {
        const normalized = {
            description: String(config.description || '').trim(),
            type: String(config.type || ''),
            tagSymbol: String(config.tagSymbol || '').trim(),
            requiredConsistency: !!config.requiredConsistency,
            style: config.style === 'xml' ? 'xml' : 'escape',
        };

        const parsedReservedWidth = Number(config.reservedWidth);
        normalized.reservedWidth =
            Number.isFinite(parsedReservedWidth) && parsedReservedWidth > 0
                ? Math.floor(parsedReservedWidth)
                : 0;

        if (normalized.type === 'withCustomParameter') {
            normalized.bracket = String(
                config.bracket || (normalized.style === 'xml' ? 'none' : '<')
            );
            normalized.maskValue = !!config.maskValue;
        }

        normalized.alwaysTranslate = config.alwaysTranslate === true;
        normalized.alwaysAddToKnowledgeBase = config.alwaysAddToKnowledgeBase === true;

        return normalized;
    }

    normalizeTagReservedWidthOverrides(overrides = {}) {
        if (!overrides || typeof overrides !== 'object') {
            return {};
        }

        const normalized = {};
        Object.entries(overrides).forEach(([key, value]) => {
            const trimmedKey = String(key || '').trim();
            if (!trimmedKey) {
                return;
            }
            const parsedReservedWidth = Number(value);
            const reservedWidth =
                Number.isFinite(parsedReservedWidth) && parsedReservedWidth > 0
                    ? Math.floor(parsedReservedWidth)
                    : 0;
            if (reservedWidth > 0) {
                normalized[trimmedKey] = reservedWidth;
            }
        });

        return normalized;
    }

    buildTagReservedWidthOverrideKey(tagConfig = {}, source = 'default', pluginName = '') {
        const safeSource = String(source || 'default')
            .trim()
            .toLowerCase();
        const safeStyle = tagConfig.style === 'xml' ? 'xml' : 'escape';
        const safeType = String(tagConfig.type || '').trim();
        const safeSymbol = String(tagConfig.tagSymbol || '').trim();
        const safeBracket =
            safeType === 'withCustomParameter'
                ? String(tagConfig.bracket || (safeStyle === 'xml' ? 'none' : '<')).trim()
                : '';
        const sourcePart =
            safeSource === 'plugin'
                ? `plugin:${String(pluginName || '')
                      .trim()
                      .toLowerCase()}`
                : safeSource;

        return `${sourcePart}|${safeStyle}|${safeType}|${safeSymbol}|${safeBracket}`;
    }

    resolveTagReservedWidth(tagConfig = {}, source = 'default', pluginName = '') {
        const baseReservedWidth = this.normalizeCustomTagConfig(tagConfig).reservedWidth;
        const key = this.buildTagReservedWidthOverrideKey(tagConfig, source, pluginName);
        const overrideValue = this.tagReservedWidthOverrides[key];
        const parsedOverride = Number(overrideValue);
        const hasOverride = Number.isFinite(parsedOverride) && parsedOverride > 0;
        return hasOverride ? Math.floor(parsedOverride) : baseReservedWidth;
    }

    setTagReservedWidthOverride(
        tagConfig = {},
        source = 'default',
        pluginName = '',
        reservedWidth = 0
    ) {
        const key = this.buildTagReservedWidthOverrideKey(tagConfig, source, pluginName);
        const nextReservedWidth = this.normalizeCustomTagConfig({ reservedWidth }).reservedWidth;
        const baseReservedWidth = this.normalizeCustomTagConfig(tagConfig).reservedWidth;
        const nextOverrides = { ...this.tagReservedWidthOverrides };

        if (nextReservedWidth === baseReservedWidth) {
            delete nextOverrides[key];
        } else {
            nextOverrides[key] = nextReservedWidth;
        }

        this.tagReservedWidthOverrides = this.normalizeTagReservedWidthOverrides(nextOverrides);
        this._refreshTagManager();
    }

    applyTagReservedWidth(tagConfig, source, pluginName) {
        return {
            ...tagConfig,
            reservedWidth: this.resolveTagReservedWidth(tagConfig, source, pluginName),
        };
    }

    /** Merge plugin + user custom tags and push to TagManager. */
    _refreshTagManager() {
        const defaultTags = TAG_CONFIGS.map((tag) => {
            return this.applyTagReservedWidth(tag, 'default', '');
        });
        const pluginTags = (this.pluginTags || []).map((tag) => {
            return this.applyTagReservedWidth(tag, 'plugin', tag._pluginName || '');
        });
        const customTags = (this.customTags || []).map((tag) => {
            return this.applyTagReservedWidth(tag, 'custom', '');
        });
        this.tagManager.setBaseTagConfigs(defaultTags);
        this.tagManager.setCustomTagConfigs([...pluginTags, ...customTags]);
    }

    setCustomTags(tags) {
        const safeTags = Array.isArray(tags) ? tags : [];
        this.customTags = safeTags.map((tag) => this.normalizeCustomTagConfig(tag));
        this._refreshTagManager();
    }

    setTagReservedWidthOverrides(overrides) {
        this.tagReservedWidthOverrides = this.normalizeTagReservedWidthOverrides(overrides);
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

    /**
     * Scan cache keys for unrecognized tag-like patterns.
     * Preprocesses each key through the TagManager; any tag-like sequences that
     * were NOT consumed (i.e. survived preprocessing) are counted and returned
     * sorted by occurrence count descending.
     *
     * @param {Map|Iterable} cacheKeys
     * @returns {{ pattern: string, count: number }[]}
     */
    scanForUnknownTags(cacheKeys) {
        // Regex to detect remaining tag-like sequences after preprocessing:
        // 1. XML-style:    <Symbol>, <Symbol:N>, <Symbol:value>
        // 2. Escape-style: \Symbol, \Symbol[N], \Symbol[val], \Symbol<val>, \Symbol(val), \Symbol{val}
        const XML_TAG_RE = /<([A-Za-z][A-Za-z0-9]*)(?::([^>\n]*))?>/g;
        // Use RegExp constructor: avoids a literal ESC control char (\u001b) in source.
        // In a RegExp string, '\\u001b' becomes \u001b in the pattern = ESC byte.
        const ESC_TAG_SOURCE =
            '(?:\\\\|\\u001b)([A-Za-z${}|.!><^][A-Za-z0-9]*)' +
            '(?:\\[(\\d+)\\]|\\[([^\\]\\n]*)\\]|<([^>\\n]*)>|\\(([^)\\n]*)\\)|\\{([^}\\n]*)\\})?';
        const ESC_TAG_RE = new RegExp(ESC_TAG_SOURCE, 'g');

        const counts = new Map();

        const normalizeEscapePattern = (pattern) => {
            const match = /^\\([A-Za-z${}|.!><^][A-Za-z0-9]*)(.*)$/.exec(String(pattern || ''));
            if (!match) {
                return String(pattern || '');
            }

            return `\\${match[1].toUpperCase()}${match[2]}`;
        };

        const recordXml = (sym, val) => {
            let pattern;
            if (val === undefined || val === null) {
                pattern = `<${sym}>`;
            } else if (/^\d+$/.test(val)) {
                pattern = `<${sym}:N>`;
            } else {
                pattern = `<${sym}:…>`;
            }
            counts.set(pattern, (counts.get(pattern) || 0) + 1);
        };

        const recordEsc = (sym, numVal, sqVal, angVal, roundVal, curlyVal) => {
            const normalizedSym = String(sym || '').toUpperCase();
            let pattern;
            if (numVal !== undefined) {
                pattern = `\\${normalizedSym}[N]`;
            } else if (sqVal !== undefined) {
                pattern = `\\${normalizedSym}[…]`;
            } else if (angVal !== undefined) {
                pattern = `\\${normalizedSym}<…>`;
            } else if (roundVal !== undefined) {
                pattern = `\\${normalizedSym}(…)`;
            } else if (curlyVal !== undefined) {
                pattern = `\\${normalizedSym}{…}`;
            } else {
                pattern = `\\${normalizedSym}`;
            }
            counts.set(pattern, (counts.get(pattern) || 0) + 1);
        };

        const keys = cacheKeys instanceof Map ? cacheKeys.keys() : cacheKeys;
        for (const key of keys) {
            if (typeof key !== 'string') continue;

            let text = key;
            try {
                const result = this.tagManager.preprocessTags(key);
                text = result.preprocessedText;
            } catch (_e) {
                // keep original key on preprocessing failure
            }

            let m;
            XML_TAG_RE.lastIndex = 0;
            while ((m = XML_TAG_RE.exec(text)) !== null) {
                recordXml(m[1], m[2]);
            }
            ESC_TAG_RE.lastIndex = 0;
            while ((m = ESC_TAG_RE.exec(text)) !== null) {
                recordEsc(m[1], m[2], m[3], m[4], m[5], m[6]);
            }
        }

        // Filter out patterns already covered by registered tags
        const registeredPatterns = this.tagManager.getRegisteredDetectionPatterns();
        for (const pattern of registeredPatterns) {
            counts.delete(normalizeEscapePattern(pattern));
        }

        return Array.from(counts.entries())
            .map(([pattern, count]) => ({ pattern, count }))
            .sort((a, b) => b.count - a.count);
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
        if (
            rawType === 'message' ||
            rawType === 'message_portrait' ||
            rawType === 'scroll_text' ||
            rawType === 'speaker' ||
            rawType === 'choice'
        ) {
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
        const mode = this.runtime?.officialNameEnforcementMode;
        return typeof mode === 'string' ? mode : 'none';
    }

    getOfficialNameEnforcementPattern() {
        const pattern = this.runtime?.namePatternForEnforcing;
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
        const sourceLang = this.runtime?.sourceLang || 'ja';
        const targetLang = this.runtime?.targetLang || 'en';
        const pairKey = `${sourceLang}-${targetLang}`;
        const officialNameMap = new Map();

        const pairProfiles =
            this.runtime?.nameProfilesByLangPair &&
            typeof this.runtime.nameProfilesByLangPair[pairKey] === 'object'
                ? this.runtime.nameProfilesByLangPair[pairKey]
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

        if (this.runtime?.translationCache instanceof Map) {
            for (const [cacheKey, value] of this.runtime.translationCache.entries()) {
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

            const originalName =
                matches[0] && typeof matches[0][1] === 'string' ? matches[0][1] : '';
            if (!originalName) {
                return value;
            }

            const officialNameMap = this.getOfficialNameMap();
            const officialTranslation = officialNameMap.get(originalName);
            if (!officialTranslation) {
                return value;
            }

            let nextValue = this.replaceFirstMatchedCapture(value, pattern, officialTranslation);

            if (this.runtime?.officialNameEnforcementIncludeAllText) {
                const replacementPairs = Array.from(officialNameMap.entries()).sort(
                    (left, right) => right[0].length - left[0].length
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
        const retryState = options && options.retryState ? options.retryState : null;

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
                const { preprocessedText, tagCounts, caseMap } =
                    this.tagManager.preprocessTags(llmInputValue);
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
            const sourceName = this.getLanguageName(this.runtime.sourceLang);
            const targetName = this.getLanguageName(this.runtime.targetLang);
            const content = JSON.stringify(jsonMap);
            const expectedKeys = Object.keys(jsonMap);
            const expectedValueLengthsByKey = {};
            for (const item of itemData) {
                expectedValueLengthsByKey[item.jsonKey] =
                    typeof item.preprocessed === 'string' ? item.preprocessed.length : 0;
            }

            console.log(
                '[AIEngine] Batch translate items:',
                items.length,
                'JSON keys:',
                expectedKeys.length
            );

            // 2. BUILD REQUEST PAYLOAD
            // Build knowledge hints from matching knowledge base entries
            const preprocessedTexts = itemData.map((item) => item.preprocessed);
            ensureKnowledgeForLangPair(
                this.runtime.sourceLang || 'ja',
                this.runtime.targetLang || 'en'
            );
            const knowledgeEntries = getKnowledgeEntries();
            const relevantKnowledge = findRelevantEntries(knowledgeEntries, preprocessedTexts);
            const knowledgeHints = buildKnowledgeHints(relevantKnowledge);

            let knowledgePromptPart = '';
            if (knowledgeHints) {
                knowledgePromptPart = ` Knowledge base of proper names and terms that MUST be used for consistency: ${knowledgeHints}.`;
            }

            const askLlmForKbase = !!(this.runtime && this.runtime.askLlmToAddToKnowledge);
            let kbaseInstructionPart = '';
            if (askLlmForKbase) {
                kbaseInstructionPart = ' ' + buildKbaseInstruction();
                // Allow kbase as an extra key in streaming guardrails
                expectedKeys.push('kbase');
            }

            const alwaysTranslateTagIds =
                this.tagManager.getAlwaysTranslateTagIds(preprocessedTexts);
            const alwaysTranslatePart =
                alwaysTranslateTagIds.length > 0
                    ? ` Make sure to ALWAYS translate to target language contents of following tags: ${alwaysTranslateTagIds.join(', ')}.`
                    : '';

            const alwaysKbaseTagIds =
                this.tagManager.getAlwaysAddToKnowledgeBaseTagIds(preprocessedTexts);
            const alwaysKbasePart =
                alwaysKbaseTagIds.length > 0
                    ? ` When translating following tags always put all translations into knowledge base: ${alwaysKbaseTagIds.join(', ')}.`
                    : '';

            const payload = {
                model: this.selectedModel,
                messages: [
                    {
                        role: 'system',
                        content: `Translate video game text from ${sourceName} to ${targetName}. ${this.systemPrompt} Official name translations, they HAVE to be used for consistency with existing material, don't make up your own translations: ${nameHints}.${knowledgePromptPart} The names might contain additional info, like gender, in brackets. Use it for additional context.${alwaysTranslatePart}${kbaseInstructionPart}${alwaysKbasePart}`,
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
                expectedValueLengthsByKey,
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
                            retryState,
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
            // Extract kbase entries before shape validation so they don't interfere
            if (askLlmForKbase && translatedMap) {
                const kbaseEntries = extractKbaseEntries(translatedMap);
                if (kbaseEntries.length > 0) {
                    mergeKnowledgeEntries(kbaseEntries);
                    console.log(
                        '[AIEngine] Merged',
                        kbaseEntries.length,
                        'knowledge base entries from LLM response'
                    );
                }
                stripKbaseFromMap(translatedMap);
            }

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
                    retryState,
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
            const bannedPhrases = this.getBannedPhrasesList();

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

                const bannedPhraseHit = this.findFirstBannedPhrase(rawSlice, bannedPhrases);
                if (bannedPhraseHit) {
                    failures.push({
                        ...itemD,
                        rejectReason: `Contains banned phrase: ${bannedPhraseHit}`,
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
                    retryState,
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
            const expectedValueLengthsByKey = options.expectedValueLengthsByKey || {};
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
                const monitorState = StreamGuardrails.createMonitorState(expectedKeys, {
                    bannedPhrases: this.getBannedPhrasesList(),
                    expectedValueLengthsByKey,
                    lengthMultiplierForMaxLength: this.lengthMultiplierForMaxLength,
                    minimumMaxLength: this.minimumMaxLength,
                });
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
                            officialTranslation
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
        if (this.apiKey) {
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
