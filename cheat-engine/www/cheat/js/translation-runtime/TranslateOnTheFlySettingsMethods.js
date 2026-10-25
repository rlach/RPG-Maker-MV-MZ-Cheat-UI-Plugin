import { TranslateOnTheFlyState } from '../TranslateOnTheFlyState.js';
import { createEngine } from '../../translate-engines/index.js';
import { ensureKnowledgeForLangPair } from '../KnowledgeBaseRuntime.js';
import {
    GameTranslationSettings,
    GAME_TRANSLATION_SETTINGS_KEYS,
    GAME_TAG_SETTINGS_KEYS,
    pickGameTranslationSettings,
} from '../GameTranslationSettings.js';
import {
    createPersistedTranslationSettingsDefaults,
    getDefaultEngineSpecificSettings,
    normalizePersistedTranslationSettings,
    serializePersistedTranslationSettings,
} from './TranslationRuntimeDefaults.js';

const sanitizeEngineConfigForPersistence = (engineConfig = {}) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(engineConfig)) {
        if (
            /Options$/i.test(key) ||
            key === 'aiApiKey' ||
            GAME_TAG_SETTINGS_KEYS.includes(key) ||
            GAME_TRANSLATION_SETTINGS_KEYS.includes(key)
        ) {
            continue;
        }
        sanitized[key] = value;
    }
    return sanitized;
};

const AI_API_KEY_SECRET_NAMESPACE = 'translate-on-the-fly:ai-api-key';

const normalizeAiProvider = (provider) => {
    const normalized = String(provider || 'openApi').trim();
    return normalized === 'gpt4all' ? 'openApi' : normalized;
};

export const translateOnTheFlySettingsMethods = {
    loadSettings() {
        const rawData = this.kvStorage.getAll();

        let normalized;
        if (!rawData || typeof rawData !== 'object' || Object.keys(rawData).length === 0) {
            normalized = createPersistedTranslationSettingsDefaults();
        } else {
            try {
                const candidate =
                    typeof rawData.data === 'string'
                        ? JSON.parse(rawData.data)
                        : rawData && typeof rawData.data === 'object'
                          ? rawData.data
                          : rawData;
                normalized = normalizePersistedTranslationSettings(candidate);
            } catch (error) {
                console.warn(
                    '[TranslateOnTheFly] Failed to parse settings JSON, using defaults:',
                    error
                );
                normalized = createPersistedTranslationSettingsDefaults();
            }
        }

        Object.assign(this, normalized);
        this.loadGameTranslationSettings();

        if (this.linkDescriptionMaxWidthToDialogue) {
            this.descriptionMaxLineWidth = this.maxLineWidth;
        }

        TranslateOnTheFlyState.setEnabled(this.enabled, { notify: false });
    },

    getGameTranslationSettingsStore() {
        return new GameTranslationSettings(this.getSplitCacheDirectoryPath());
    },

    loadGameTranslationSettings() {
        const store = this.getGameTranslationSettingsStore();
        const settings = store.updateSection('translation', pickGameTranslationSettings(this), {
            missingOnly: true,
        });
        Object.assign(this, pickGameTranslationSettings(settings));
        const legacy = this.engineSettings?.openApi || this.engineSettings?.gpt4all || {};
        store.updateSection(
            'tags',
            {
                tagFormat: legacy.aiTagFormat ?? 'tags',
                customTags: legacy.aiCustomTags ?? legacy.customTags ?? this.aiCustomTags ?? [],
                tagOverrides: legacy.aiTagOverrides ?? legacy.tagOverrides ?? {},
            },
            { missingOnly: true }
        );
    },

    applyGameTranslationEngineSettings() {
        const tags = this.getGameTranslationSettingsStore().read().tags || {};
        if (this.engine?.tagManager) this.engine.aiTagFormat = tags.tagFormat || 'tags';
        this.engine?.setCustomTags?.(tags.customTags || []);
        this.engine?.setTagOverrides?.(tags.tagOverrides || {});
    },

    restoreTranslationEngineSettings() {
        const localSettings = this.engineSettings?.[this.translationEngine] || {};
        Object.assign(this.engine, sanitizeEngineConfigForPersistence(localSettings));
        this.applyGameTranslationEngineSettings();
    },

    saveGameTranslationSettings() {
        const store = this.getGameTranslationSettingsStore();
        store.updateSection('translation', pickGameTranslationSettings(this));
        if (this.engine?.setCustomTags) {
            store.updateSection('tags', {
                tagFormat: this.engine.aiTagFormat,
                customTags: this.engine.customTags,
                tagOverrides: this.engine.tagOverrides,
            });
        }
    },

    /** @this {any} */
    getAiApiKeySecretId(provider) {
        const resolvedProvider = provider || this.aiProvider;
        return `${AI_API_KEY_SECRET_NAMESPACE}:${normalizeAiProvider(resolvedProvider)}`;
    },

    /** @this {any} */
    async saveAiApiKeyToSecureStore(apiKey, provider) {
        if (!this.secureSecretStorage) {
            return false;
        }

        const secretId = this.getAiApiKeySecretId(provider || this.aiProvider);
        const normalizedApiKey = typeof apiKey === 'string' ? apiKey : this.aiApiKey || '';
        return this.secureSecretStorage.setSecret(secretId, normalizedApiKey);
    },

    /** @this {any} */
    async loadAiApiKeyFromSecureStore(provider) {
        if (!this.secureSecretStorage) {
            this.aiApiKey = '';
            if (this.engine) {
                this.engine.aiApiKey = '';
            }
            return '';
        }

        const secretId = this.getAiApiKeySecretId(provider || this.aiProvider);
        const apiKey = (await this.secureSecretStorage.getSecret(secretId)) || '';
        this.aiApiKey = apiKey;
        if (this.engine) {
            this.engine.aiApiKey = apiKey;
        }
        return apiKey;
    },

    saveSettings() {
        this.saveGameTranslationSettings();
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
        for (const key of GAME_TRANSLATION_SETTINGS_KEYS) delete data[key];
        for (const [engineId, config] of Object.entries(data.engineSettings || {})) {
            data.engineSettings[engineId] = sanitizeEngineConfigForPersistence(config);
        }
        this.kvStorage.setAll(data);
    },

    onChangeEnableTranslation() {
        // When real-time is enabled, this flag is ignored; still persist for when disabled later
        if (this.enableTranslation) {
            this.ensureHookInitialized('cache-only-enabled');
        }
        this.saveSettings();
        this.notifyCacheRuntime('settings-cache-only');
    },

    onChangeEnableImageReplacement() {
        this.saveSettings();
        this.notifyCacheRuntime('settings-image-cache-toggle');
    },

    onChangeTranslateFullEventInRealtime() {
        this.saveSettings();
    },

    onChangeInterruptQueueForRealtime() {
        this.saveSettings();
    },

    onChangeCurrentMapMidPhasePriority() {
        this.saveSettings();
    },

    onChangeFlatProgressWindow() {
        this.resetProgressBoxPositionToDefault();
        this.ensureProgressBoxElements();
        this.saveSettings();
    },

    onChangeHighlightImages() {
        this.saveSettings();
    },

    onChangeEnabled() {
        TranslateOnTheFlyState.setEnabled(this.enabled);
        if (this.enabled) {
            this.ensureHookInitialized('enabled-toggle');
        }
        this.saveSettings();
        this.notifyCacheRuntime('settings-enabled');
        if (this.enabled) {
            console.log('[TranslateOnTheFly] Translation enabled');
        } else {
            console.log('[TranslateOnTheFly] Translation disabled');
        }
    },

    onChangeSourceLang() {
        // Don't clear cache - keys contain source/target lang, so they don't conflict
        this.saveSettings();
        this.notifyCacheRuntime('settings-language');
        ensureKnowledgeForLangPair(this.sourceLang, this.targetLang);
    },

    onChangeTargetLang() {
        // Don't clear cache - keys contain source/target lang, so they don't conflict
        this.saveSettings();
        this.notifyCacheRuntime('settings-language');
        ensureKnowledgeForLangPair(this.sourceLang, this.targetLang);
    },

    onChangeTranslationEngine() {
        this.saveGameTranslationSettings();
        // Save current engine's configuration before switching
        if (this.engine) {
            const currentConfig = sanitizeEngineConfigForPersistence(this.engine.getConfigData());
            if (!this.engineSettings) {
                this.engineSettings = {};
            }
            this.engineSettings[this.engine.getId()] = currentConfig;
        }

        // Create new engine instance
        this.engine = createEngine(this.translationEngine, this);

        // Restore settings for new engine if available
        this.restoreTranslationEngineSettings();

        // Bind new engine config data to runtime
        const engineConfigData = this.engine.getConfigData();
        Object.keys(engineConfigData).forEach((key) => {
            this.$set(this, key, engineConfigData[key]);
        });

        // Bind new engine config methods to runtime
        const engineConfigMethods = this.engine.getConfigMethods();
        Object.keys(engineConfigMethods).forEach((methodName) => {
            this[methodName] = engineConfigMethods[methodName].bind(this.engine);
        });

        if (this.translationEngine === 'openApi' || this.translationEngine === 'gpt4all') {
            this.loadAiApiKeyFromSecureStore().catch((error) => {
                console.warn(
                    '[TranslateOnTheFly] Failed to load AI API key after engine change:',
                    error
                );
            });
        }

        // Don't clear cache - keys contain engine name, so they don't conflict
        this.saveSettings();
    },

    onChangeTextWrapping() {
        // Don't clear cache - wrapping doesn't affect cache validity
        this.saveSettings();
    },

    onChangeMaxWidth() {
        if (this.linkDescriptionMaxWidthToDialogue) {
            this.descriptionMaxLineWidth = this.maxLineWidth;
        }

        // Don't clear cache - wrapping is applied on display, not stored in cache
        this.saveSettings();
    },

    onChangeMaxWidthWithPortrait() {
        // Don't clear cache - wrapping is applied on display, not stored in cache
        this.saveSettings();
    },

    onChangeDescriptionMaxWidth() {
        // Don't clear cache - wrapping is applied on display, not stored in cache
        this.saveSettings();
    },

    onChangeLinkDescriptionMaxWidthToDialogue() {
        if (this.linkDescriptionMaxWidthToDialogue) {
            this.descriptionMaxLineWidth = this.maxLineWidth;
        }

        this.saveSettings();
    },

    onChangeDescriptionMaxRows() {
        this.saveSettings();
    },

    onChangeAddBoxWidthInfoToLlmPrompt() {
        this.saveSettings();
    },

    onChangeRemoveNewlinesBeforeWrappingMaxCount() {
        const parsed = Number(this.removeNewlinesBeforeWrappingMaxCount);
        this.removeNewlinesBeforeWrappingMaxCount =
            Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
        this.saveSettings();
    },

    onChangeTextWrapFontScaleMultiplier() {
        const parsedMultiplier = Number(
            typeof this.textWrapFontScaleMultiplier === 'string'
                ? this.textWrapFontScaleMultiplier.replace(',', '.')
                : this.textWrapFontScaleMultiplier
        );

        this.textWrapFontScaleMultiplier =
            Number.isFinite(parsedMultiplier) && parsedMultiplier > 0
                ? parsedMultiplier
                : getDefaultEngineSpecificSettings().textWrapFontScaleMultiplier;

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
        if (!this.batchItemsLimit || this.batchItemsLimit < 1) this.batchItemsLimit = 1;
        this.saveSettings();
    },

    // Backward-compatible aliases for older panel/runtime calls.
    onChangeCacheOnly() {
        return this.onChangeEnableTranslation();
    },

    onChangeTranslateImagesInCacheIfAny() {
        return this.onChangeEnableImageReplacement();
    },

    onChangeTryTranslateAhead() {
        return this.onChangeTranslateFullEventInRealtime();
    },

    onChangeCancelBackgroundForOnTheFly() {
        return this.onChangeInterruptQueueForRealtime();
    },
};
