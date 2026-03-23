/**
 * ConfigManager
 * Configuration management and UI binding
 * Handles settings persistence and Vue template generation
 */

export class ConfigManager {
    constructor(aiEngine) {
        this.aiEngine = aiEngine;
    }

    /**
     * Get Vue template for configuration UI
     * @returns {string}
     */
    getTemplate() {
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
     * Get configuration data object for panel binding
     * @returns {Object}
     */
    getData() {
        return {
            aiProvider: this.aiEngine.provider,
            aiProviderOptions: [
                { text: 'OpenAPI compatible', value: 'openApi' },
                { text: 'Open WebUI', value: 'openwebui' }
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
                { text: 'Resend first half of items', value: 'resendFirstHalf' },
                { text: 'Ask AI to fix JSON', value: 'askAIToFix' },
                { text: 'Use JSON fixer API', value: 'useJsonFixer' },
                { text: 'None (fail)', value: 'none' }
            ],
            aiSystemPrompt: this.aiEngine.systemPrompt,
            aiFixRecursionMaxDepth: this.aiEngine._aiFixRecursionMaxDepth,
            useJsonFixer: this.aiEngine.useJsonFixer
        };
    }

    /**
     * Get configuration methods (handlers)
     * @returns {Object}
     */
    getMethods() {
        return {
            fetchAiModels: () => this._fetchAiModels(),
            onChangeAiProvider: (v) => this._onChangeAiProvider(v),
            onChangeAiHost: (v) => { this.aiEngine.host = v; },
            onChangeAiApiKey: (v) => { this.aiEngine.apiKey = v; },
            onChangeAiModel: (v) => { this.aiEngine.selectedModel = v; },
            onChangeAiAllowNewlineMismatch: (v) => { this.aiEngine.allowNewlineMismatch = v; },
            onChangeAiAskIfTextTranslated: (v) => { this.aiEngine.askAiIfTextTranslated = v; },
            onChangeAiInvalidJsonHandlingStrategy: (v) => { this.aiEngine.invalidJsonHandlingStrategy = v; },
            onChangeAiSystemPrompt: (v) => { this.aiEngine.systemPrompt = v; },
            onChangeAiFixRecursionMaxDepth: (v) => { this.aiEngine._aiFixRecursionMaxDepth = v; },
            onChangeUseJsonFixer: (v) => { this.aiEngine.useJsonFixer = v; }
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

        try {
            const endpoint = this._getModelsUrl();
            const headers = this._getAuthHeaders();
            const response = await fetch(endpoint, { headers });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            let models = [];

            if (this.aiEngine.provider === 'openwebui') {
                models = data.data?.map(m => m.id) || [];
            } else {
                models = data.data?.map(m => m.id) || [];
            }

            this.aiEngine.models = models;
            console.log('[ConfigManager] Fetched models:', models);
        } catch (error) {
            this.aiEngine.modelsError = error.message;
            console.error('[ConfigManager] Failed to fetch models:', error.message);
        } finally {
            this.aiEngine.loadingModels = false;
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
