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
        const panel = this.aiEngine && this.aiEngine.panel;
        if (!panel) {
            return;
        }

        if (typeof panel.bindEngineConfigTo === 'function') {
            panel.bindEngineConfigTo(panel);
        }
    }

    _savePanelSettings() {
        const panel = this.aiEngine && this.aiEngine.panel;
        if (panel && typeof panel.saveSettings === 'function') {
            panel.saveSettings();
        }
    }

    _createPersistedHandler(handler, { syncPanel = false } = {}) {
        return (...args) => {
            const result = handler(...args);
            if (syncPanel) {
                this._syncPanelEngineConfig();
            }
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
               label="Provider"
               outlined
               dense
               hide-details
               @input="onChangeAiProvider"
               @change="onChangeAiProvider"
               class="mb-2"
             ></v-select>
             <v-text-field
               v-model="aiHost"
               :label="aiProvider === 'openwebui' ? 'Open WebUI Host' : 'OpenAPI compatible Host'"
               outlined
               dense
               hide-details
               @keydown.stop
               @change="onChangeAiHost"
               class="mb-2"
             ></v-text-field>
             <v-text-field
               v-if="aiProvider === 'openwebui'"
               v-model="aiApiKey"
               label="Open WebUI API Key"
               outlined
               dense
               hide-details
               type="password"
               @keydown.stop
               @change="onChangeAiApiKey"
               class="mb-2"
             ></v-text-field>
             <div class="d-flex gap-2 mb-2 align-center">
               <v-btn
                 small
                 outlined
                 color="primary"
                 :disabled="aiLoadingModels"
                 @click="fetchAiModels"
                 :loading="aiLoadingModels"
               >
                 <v-icon small left>mdi-refresh</v-icon>
                 Fetch Models
               </v-btn>
               <div v-if="aiModelsError" class="text-caption error--text">{{ aiModelsError }}</div>
             </div>
             <v-select
               v-model="aiSelectedModel"
               :items="aiModels"
               label="Select Model"
               outlined
               dense
               hide-details
               :disabled="aiModels.length === 0"
               @change="onChangeAiModel"
               class="mb-2"
             ></v-select>

             <v-checkbox
               v-model="aiAllowNewlineMismatch"
               label="Allow non-essential tag mismatches"
               @change="onChangeAiAllowNewlineMismatch"
               class="mt-2"
               hide-details
             ></v-checkbox>

             <v-checkbox
               v-model="aiAskIfTextTranslated"
               label="ask AI if text is translated"
               @change="onChangeAiAskIfTextTranslated"
               class="mt-2"
               hide-details
             ></v-checkbox>
           
             <v-select
               v-model="aiInvalidJsonHandlingStrategy"
               :items="aiInvalidJsonHandlingStrategyOptions"
               label="Invalid JSON Handling Strategy"
               outlined
               dense
               hide-details
               @change="onChangeAiInvalidJsonHandlingStrategy"
               class="mt-2"
             ></v-select>

                         <v-text-field
                             v-if="aiInvalidJsonHandlingStrategy === 'resendXTimes'"
                             v-model.number="aiInvalidJsonResendCount"
                             label="Resend retries per batch"
                             outlined
                             dense
                             type="number"
                             min="1"
                             hide-details
                             @keydown.stop
                             @change="onChangeAiInvalidJsonResendCount"
                             class="mt-2"
                         ></v-text-field>

             <v-text-field
               v-if="aiInvalidJsonHandlingStrategy === 'askAIToFix'"
               v-model.number="aiFixRecursionMaxDepth"
               label="AI fix recursion max depth (0 = infinite)"
               outlined
               dense
               type="number"
               min="0"
               max="100"
               hide-details
               @keydown.stop
               @change="onChangeAiFixRecursionMaxDepth"
               class="mt-2"
             ></v-text-field>

             <v-textarea
               v-model="aiBannedPhrases"
               label="Banned phrases (one per line)"
               auto-grow
               rows="2"
               outlined
               dense
               hide-details
               @keydown.stop
               @change="onChangeAiBannedPhrases"
               class="mt-2"
             ></v-textarea>

             <v-checkbox
               v-model="useJsonFixer"
               label="Allow calls to json fixer (external API, don't send sensitive data)"
               @change="onChangeUseJsonFixer"
               class="mb-2"
               hide-details
             ></v-checkbox>
           
             <v-textarea
               v-model="aiSystemPrompt"
               label="System prompt"
               auto-grow
               rows="3"
               outlined
               dense
               hide-details
               @keydown.stop
               @change="onChangeAiSystemPrompt"
               class="mb-2"
             ></v-textarea>
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
     * Get configuration data object for panel binding
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
            aiAllowNewlineMismatch: this.aiEngine.allowNewlineMismatch,
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
            aiBannedPhrases: this.aiEngine.bannedPhrasesText,
            aiSystemPrompt: this.aiEngine.systemPrompt,
            aiFixRecursionMaxDepth: this.aiEngine._aiFixRecursionMaxDepth,
            useJsonFixer: this.aiEngine.useJsonFixer,
            aiCustomTags: this.aiEngine.customTags,
            aiCustomTagTypeOptions: this.aiEngine.customTagTypeOptions,
            aiCustomTagBracketOptions: this.aiEngine.customTagBracketOptions,
            aiCustomTagStyleOptions: this.aiEngine.customTagStyleOptions,
        };
    }

    /**
     * Get configuration methods (handlers)
     * @returns {Object}
     */
    getMethods() {
        return {
            fetchAiModels: () => this._fetchAiModels(),
            onChangeAiProvider: this._createPersistedHandler((v) => this._onChangeAiProvider(v), {
                syncPanel: true,
            }),
            onChangeAiHost: this._createPersistedHandler((v) => {
                this.aiEngine.host = v;
            }),
            onChangeAiApiKey: this._createPersistedHandler((v) => {
                this.aiEngine.apiKey = v;
            }),
            onChangeAiModel: this._createPersistedHandler((v) => {
                this.aiEngine.selectedModel = v;
            }),
            onChangeAiAllowNewlineMismatch: this._createPersistedHandler((v) => {
                this.aiEngine.allowNewlineMismatch = v;
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
            addAiCustomTag: this._createPersistedHandler(
                (tagConfig) => {
                    this.aiEngine.addCustomTag(tagConfig);
                },
                {
                    syncPanel: true,
                }
            ),
            updateAiCustomTag: this._createPersistedHandler(
                (index, tagConfig) => {
                    this.aiEngine.updateCustomTag(index, tagConfig);
                },
                {
                    syncPanel: true,
                }
            ),
            removeAiCustomTag: this._createPersistedHandler(
                (index) => {
                    this.aiEngine.removeCustomTag(index);
                },
                {
                    syncPanel: true,
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
            if (this.aiEngine.panel && typeof this.aiEngine.panel.saveSettings === 'function') {
                this.aiEngine.panel.saveSettings();
            }
        }
    }

    /**
     * Handle provider change
     * @private
     */
    _onChangeAiProvider(provider) {
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
        if (this.aiEngine.provider === 'openwebui' && this.aiEngine.apiKey) {
            headers['Authorization'] = `Bearer ${this.aiEngine.apiKey}`;
        }
        return headers;
    }
}
