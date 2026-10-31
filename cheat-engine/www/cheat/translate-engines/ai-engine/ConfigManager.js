import { TAG_FORMAT_OPTIONS } from './TagSyntax.js';
/**
 * ConfigManager
 * Configuration management and UI binding
 * Handles settings persistence and Vue template generation
 */

export class ConfigManager {
    constructor(aiEngine) {
        this.aiEngine = aiEngine;
    }

    _syncPanelEngineConfig() {
        const runtime = this.aiEngine && this.aiEngine.runtime;
        if (!runtime) {
            return;
        }

        if (typeof runtime.bindEngineConfigTo === 'function') {
            runtime.bindEngineConfigTo(runtime);
        }
    }

    _savePanelSettings() {
        const runtime = this.aiEngine && this.aiEngine.runtime;
        if (runtime && typeof runtime.saveSettings === 'function') {
            runtime.saveSettings();
        }
    }

    _createPersistedHandler(handler) {
        return async (...args) => {
            const result = await Promise.resolve(handler(...args));
            this._syncPanelEngineConfig();
            this._savePanelSettings();
            return result;
        };
    }

    _normalizeModelsResponse(data) {
        const payload = data && typeof data === 'object' ? data : {};
        const candidates = Array.isArray(payload.data)
            ? payload.data
            : Array.isArray(payload.models)
              ? payload.models
              : Array.isArray(payload)
                ? payload
                : [];

        const normalized = [];
        for (const item of candidates) {
            const raw =
                typeof item === 'string'
                    ? item
                    : item && typeof item.id === 'string'
                      ? item.id
                      : item && typeof item.name === 'string'
                        ? item.name
                        : '';
            const model = raw.trim();
            if (!model || normalized.includes(model)) {
                continue;
            }
            normalized.push(model);
        }

        return normalized;
    }

    static getTemplate() {
        return `
       <div v-if="translationEngine === 'openApi' || translationEngine === 'gpt4all'" class="mt-3">
             <v-select
               v-model="aiProvider"
               :items="aiProviderOptions"
               label="Provider" variant="outlined" density="compact"
               hide-details
               @update:model-value="onChangeAiProvider"
               @update:model-value="onChangeAiProvider"
               class="mb-2"
              item-title="text"></v-select>
             <v-text-field
               v-model="aiHost"
               :label="aiProvider === 'openwebui' ? 'Open WebUI Host' : 'OpenAPI compatible Host'" variant="outlined" density="compact"
               hide-details
               @keydown.stop
               @update:model-value="onChangeAiHost"
               class="mb-2"
             ></v-text-field>
             <v-text-field
                             v-if="aiProvider === 'openwebui' || aiProvider === 'openApi'"
               v-model="aiApiKey"
                             :label="aiProvider === 'openwebui' ? 'Open WebUI API Key' : 'OpenAPI compatible API Key'" variant="outlined" density="compact"
               hide-details
               type="password"
               @keydown.stop
               @update:model-value="onChangeAiApiKey"
               class="mb-2"
             ></v-text-field>
             <div class="d-flex gap-2 mb-2 align-center">
               <v-btn size="small" variant="outlined"
                 color="primary"
                 :disabled="aiLoadingModels"
                 @click="fetchAiModels"
                 :loading="aiLoadingModels"
               >
                 <v-icon size="small" left>mdi-refresh</v-icon>
                 Fetch Models
               </v-btn>
               <div v-if="aiModelsError" class="text-caption error--text">{{ aiModelsError }}</div>
             </div>
             <v-select
               v-model="aiSelectedModel"
               :items="aiModels"
               label="Select Model" variant="outlined" density="compact"
               hide-details
               :disabled="aiModels.length === 0"
               @update:model-value="onChangeAiModel"
               class="mb-2"
              item-title="text"></v-select>

             <v-checkbox
               v-model="aiAskIfTextTranslated"
               label="ask AI if text is translated"
               @update:model-value="onChangeAiAskIfTextTranslated"
               class="mt-2"
               hide-details
             ></v-checkbox>

             <v-select
               v-model="aiInvalidJsonHandlingStrategy"
               :items="aiInvalidJsonHandlingStrategyOptions"
               label="Invalid JSON Handling Strategy" variant="outlined" density="compact"
               hide-details
               @update:model-value="onChangeAiInvalidJsonHandlingStrategy"
               class="mt-2"
              item-title="text"></v-select>

                         <v-text-field
                             v-model.number="aiLengthMultiplierForMaxLength"
                             label="Length multiplier for max length" variant="outlined" density="compact"
                             type="number"
                             min="0.1"
                             step="0.1"
                             hide-details
                             @keydown.stop
                             @update:model-value="onChangeAiLengthMultiplierForMaxLength"
                             class="mt-2"
                         ></v-text-field>

                         <v-text-field
                             v-model.number="aiMinimumMaxLength"
                             label="Minimum max length" variant="outlined" density="compact"
                             type="number"
                             min="1"
                             hide-details
                             @keydown.stop
                             @update:model-value="onChangeAiMinimumMaxLength"
                             class="mt-2"
                         ></v-text-field>

                         <v-text-field
                             v-if="aiInvalidJsonHandlingStrategy === 'resendXTimes'"
                             v-model.number="aiInvalidJsonResendCount"
                             label="Resend retries per batch" variant="outlined" density="compact"
                             type="number"
                             min="1"
                             hide-details
                             @keydown.stop
                             @update:model-value="onChangeAiInvalidJsonResendCount"
                             class="mt-2"
                         ></v-text-field>

             <v-text-field
               v-if="aiInvalidJsonHandlingStrategy === 'askAIToFix'"
               v-model.number="aiFixRecursionMaxDepth"
               label="AI fix recursion max depth (0 = infinite)" variant="outlined" density="compact"
               type="number"
               min="0"
               max="100"
               hide-details
               @keydown.stop
               @update:model-value="onChangeAiFixRecursionMaxDepth"
               class="mt-2"
             ></v-text-field>

             <v-textarea
               v-model="aiBannedPhrases"
               label="Banned phrases (one per line)"
               auto-grow
               rows="2" variant="outlined" density="compact"
               hide-details
               @keydown.stop
               @update:model-value="onChangeAiBannedPhrases"
               class="mt-2"
             ></v-textarea>

             <v-checkbox
               v-model="useJsonFixer"
               label="Allow calls to json fixer (external API, don't send sensitive data)"
               @update:model-value="onChangeUseJsonFixer"
               class="mb-2"
               hide-details
             ></v-checkbox>

             <v-textarea
               v-model="aiSystemPrompt"
               label="System prompt"
               auto-grow
               rows="3" variant="outlined" density="compact"
               hide-details
               @keydown.stop
               @update:model-value="onChangeAiSystemPrompt"
               class="mb-2"
             ></v-textarea>

             <v-text-field
               v-model="aiReasoningOpenToken"
               label="Reasoning open token (e.g. <think>)" variant="outlined" density="compact"
               hide-details
               @keydown.stop
               @update:model-value="onChangeAiReasoningOpenToken"
               class="mb-2"
             ></v-text-field>

             <v-text-field
               v-model="aiReasoningCloseToken"
               label="Reasoning close token (e.g. </think>)" variant="outlined" density="compact"
               hide-details
               @keydown.stop
               @update:model-value="onChangeAiReasoningCloseToken"
               class="mb-2"
             ></v-text-field>

             <v-checkbox
               v-if="aiProvider === 'openApi'"
               v-model="aiUseStrataConstrained"
               label="Experimental: Use strata constrained"
               hint="Sends the expected JSON Schema and forces reasoning effort to none for JSON requests. Requires a compatible PolyStrata build."
               persistent-hint
               @update:model-value="onChangeAiUseStrataConstrained"
               class="mb-2"
             ></v-checkbox>
             <v-select
               v-model="aiReasoningEffort"
               :items="aiReasoningEffortOptions"
               label="Reasoning effort" variant="outlined" density="compact"
               hide-details
               @update:model-value="onChangeAiReasoningEffort"
               class="mb-2"
              item-title="text"></v-select>
             </div>
    `;
    }

    /**
     * Get Vue template for configuration UI
     * @returns {string}
     */
    getTemplate() {
        return ConfigManager.getTemplate();
    }

    /**
     * Get configuration data object for runtime binding
     * @returns {Object}
     */
    getData() {
        return {
            aiProvider: this.aiEngine.provider,
            aiProviderOptions: [
                { text: 'OpenAPI compatible', value: 'openApi' },
                { text: 'Open WebUI', value: 'openwebui' },
            ],
            aiHost: this.aiEngine.host,
            aiApiKey: this.aiEngine.apiKey,
            aiSelectedModel: this.aiEngine.selectedModel,
            aiModels: this.aiEngine.models,
            aiLoadingModels: this.aiEngine.loadingModels,
            aiModelsError: this.aiEngine.modelsError,
            aiAskIfTextTranslated: this.aiEngine.askAiIfTextTranslated,
            aiInvalidJsonHandlingStrategy: this.aiEngine.invalidJsonHandlingStrategy,
            aiInvalidJsonHandlingStrategyOptions: [
                { text: 'Split in half', value: 'resendFirstHalf' },
                { text: 'Resend X times', value: 'resendXTimes' },
                { text: 'Ask AI to fix JSON', value: 'askAIToFix' },
                { text: 'Use JSON fixer API', value: 'useJsonFixer' },
                { text: 'None (fail)', value: 'none' },
            ],
            aiInvalidJsonResendCount: this.aiEngine.aiInvalidJsonResendCount,
            aiLengthMultiplierForMaxLength: this.aiEngine.aiLengthMultiplierForMaxLength,
            aiMinimumMaxLength: this.aiEngine.aiMinimumMaxLength,
            aiBannedPhrases: this.aiEngine.bannedPhrasesText,
            aiSystemPrompt: this.aiEngine.systemPrompt,
            aiFixRecursionMaxDepth: this.aiEngine._aiFixRecursionMaxDepth,
            useJsonFixer: this.aiEngine.useJsonFixer,
            aiTagFormat: this.aiEngine.aiTagFormat,
            aiTagFormatOptions: TAG_FORMAT_OPTIONS,
            aiCustomTags: this.aiEngine.customTags,
            aiTagOverrides: this.aiEngine.tagOverrides,
            aiCustomTagTypeOptions: this.aiEngine.customTagTypeOptions,
            aiCustomTagBracketOptions: this.aiEngine.customTagBracketOptions,
            aiCustomTagStyleOptions: this.aiEngine.customTagStyleOptions,
            aiReasoningOpenToken: this.aiEngine.reasoningOpenToken,
            aiReasoningCloseToken: this.aiEngine.reasoningCloseToken,
            aiReasoningEffort: this.aiEngine.reasoningEffort,
            aiUseStrataConstrained: this.aiEngine.useStrataConstrained,
            aiReasoningEffortOptions: this.aiEngine.aiReasoningEffortOptions,
        };
    }

    /**
     * Get configuration methods (handlers)
     * @returns {Object}
     */
    getMethods() {
        return {
            fetchAiModels: () => this._fetchAiModels(),
            onChangeAiProvider: this._createPersistedHandler((v) => this._onChangeAiProvider(v)),
            onChangeAiHost: this._createPersistedHandler((v) => {
                this.aiEngine.host = v;
            }),
            onChangeAiApiKey: this._createPersistedHandler(async (v) => {
                this.aiEngine.apiKey = v;
                const runtime = this.aiEngine.runtime;
                if (runtime && typeof runtime.saveAiApiKeyToSecureStore === 'function') {
                    await runtime.saveAiApiKeyToSecureStore(v, this.aiEngine.provider);
                }
            }),
            onChangeAiModel: this._createPersistedHandler((v) => {
                this.aiEngine.selectedModel = v;
            }),
            onChangeAiAskIfTextTranslated: this._createPersistedHandler((v) => {
                this.aiEngine.askAiIfTextTranslated = v;
            }),
            onChangeAiInvalidJsonHandlingStrategy: this._createPersistedHandler((v) => {
                this.aiEngine.invalidJsonHandlingStrategy = v;
            }),
            onChangeAiInvalidJsonResendCount: this._createPersistedHandler((v) => {
                this.aiEngine.aiInvalidJsonResendCount = v;
            }),
            onChangeAiLengthMultiplierForMaxLength: this._createPersistedHandler((v) => {
                this.aiEngine.aiLengthMultiplierForMaxLength = v;
            }),
            onChangeAiMinimumMaxLength: this._createPersistedHandler((v) => {
                this.aiEngine.aiMinimumMaxLength = v;
            }),
            onChangeAiBannedPhrases: this._createPersistedHandler((v) => {
                this.aiEngine.bannedPhrasesText = this.aiEngine.normalizeBannedPhrasesText(v);
            }),
            onChangeAiSystemPrompt: this._createPersistedHandler((v) => {
                this.aiEngine.systemPrompt = v;
            }),
            onChangeAiFixRecursionMaxDepth: this._createPersistedHandler((v) => {
                this.aiEngine._aiFixRecursionMaxDepth = v;
            }),
            onChangeUseJsonFixer: this._createPersistedHandler((v) => {
                this.aiEngine.useJsonFixer = v;
            }),
            onChangeAiReasoningOpenToken: this._createPersistedHandler((v) => {
                this.aiEngine.reasoningOpenToken = typeof v === 'string' ? v : '';
            }),
            onChangeAiReasoningCloseToken: this._createPersistedHandler((v) => {
                this.aiEngine.reasoningCloseToken = typeof v === 'string' ? v : '';
            }),
            onChangeAiUseStrataConstrained: this._createPersistedHandler((value) => {
                this.aiEngine.useStrataConstrained = value === true;
            }),
            onChangeAiReasoningEffort: this._createPersistedHandler((v) => {
                this.aiEngine.reasoningEffort = v || 'none';
            }),
            onChangeAiTagFormat: this._createPersistedHandler((value) => {
                this.aiEngine.aiTagFormat = value;
            }),
            addAiCustomTag: this._createPersistedHandler((tagConfig) => {
                this.aiEngine.addCustomTag(tagConfig);
            }),
            updateAiCustomTag: this._createPersistedHandler((index, tagConfig) => {
                this.aiEngine.updateCustomTag(index, tagConfig);
            }),
            removeAiCustomTag: this._createPersistedHandler((index) => {
                this.aiEngine.removeCustomTag(index);
            }),
            updateAiTagOverrides: this._createPersistedHandler(
                (source, tagConfig, overrides, pluginName = '') => {
                    this.aiEngine.setOverrides(tagConfig, source, pluginName, overrides);
                }
            ),
        };
    }

    /**
     * Check if engine is fully configured
     * @returns {boolean}
     */
    isReady() {
        return !!this.aiEngine.selectedModel;
    }

    /**
     * Fetch available models from API
     * @returns {Promise<void>}
     */
    async _fetchAiModels() {
        this.aiEngine.loadingModels = true;
        this.aiEngine.modelsError = '';
        this._syncPanelEngineConfig();

        try {
            const endpoint = this._getModelsUrl();
            const headers = this._getAuthHeaders();
            const response = await fetch(endpoint, { headers });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const models = this._normalizeModelsResponse(data);

            this.aiEngine.models = models;
            if (this.aiEngine.selectedModel && !models.includes(this.aiEngine.selectedModel)) {
                this.aiEngine.selectedModel = '';
            }
            if (!this.aiEngine.selectedModel && models.length > 0) {
                this.aiEngine.selectedModel = models[0];
            }
            console.log('[ConfigManager] Fetched models:', models);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.aiEngine.modelsError = message;
            console.error('[ConfigManager] Failed to fetch models:', message);
        } finally {
            this.aiEngine.loadingModels = false;
            this._syncPanelEngineConfig();
            this.aiEngine.runtime?.saveSettings?.();
        }
    }

    /**
     * Handle provider change
     * @private
     */
    async _onChangeAiProvider(provider) {
        this.aiEngine.provider = provider === 'gpt4all' ? 'openApi' : provider;

        // Reset models and selected model
        this.aiEngine.models = [];
        this.aiEngine.selectedModel = '';

        // Adjust default host
        if (provider === 'openwebui') {
            this.aiEngine.host = 'http://localhost:8080';
        } else {
            this.aiEngine.host = 'http://localhost:4891';
        }

        const runtime = this.aiEngine.runtime;
        if (runtime && typeof runtime.loadAiApiKeyFromSecureStore === 'function') {
            await runtime.loadAiApiKeyFromSecureStore(this.aiEngine.provider);
        }
    }

    /**
     * Get models endpoint
     * @private
     */
    _getModelsUrl() {
        const host = this.aiEngine.host || 'http://localhost:4891';
        if (this.aiEngine.provider === 'openwebui') {
            return `${host}/api/models`;
        }
        return `${host}/v1/models`;
    }

    /**
     * Get auth headers
     * @private
     */
    _getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.aiEngine.apiKey) {
            headers['Authorization'] = `Bearer ${this.aiEngine.apiKey}`;
        }
        return headers;
    }
}
