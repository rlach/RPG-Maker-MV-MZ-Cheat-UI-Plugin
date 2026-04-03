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

    if (typeof panel.bindEngineConfigTo === "function") {
      panel.bindEngineConfigTo(panel);
    }
  }

  _normalizeModelsResponse(data) {
    const payload = data && typeof data === "object" ? data : {};
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
        typeof item === "string"
          ? item
          : item && typeof item.id === "string"
            ? item.id
            : item && typeof item.name === "string"
              ? item.name
              : "";
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
        { text: "OpenAPI compatible", value: "openApi" },
        { text: "Open WebUI", value: "openwebui" },
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
        { text: "Resend first half of items", value: "resendFirstHalf" },
        { text: "Ask AI to fix JSON", value: "askAIToFix" },
        { text: "Use JSON fixer API", value: "useJsonFixer" },
        { text: "None (fail)", value: "none" },
      ],
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
      onChangeAiProvider: (v) => this._onChangeAiProvider(v),
      onChangeAiHost: (v) => {
        this.aiEngine.host = v;
      },
      onChangeAiApiKey: (v) => {
        this.aiEngine.apiKey = v;
      },
      onChangeAiModel: (v) => {
        this.aiEngine.selectedModel = v;
      },
      onChangeAiAllowNewlineMismatch: (v) => {
        this.aiEngine.allowNewlineMismatch = v;
      },
      onChangeAiAskIfTextTranslated: (v) => {
        this.aiEngine.askAiIfTextTranslated = v;
      },
      onChangeAiInvalidJsonHandlingStrategy: (v) => {
        this.aiEngine.invalidJsonHandlingStrategy = v;
      },
      onChangeAiSystemPrompt: (v) => {
        this.aiEngine.systemPrompt = v;
      },
      onChangeAiFixRecursionMaxDepth: (v) => {
        this.aiEngine._aiFixRecursionMaxDepth = v;
      },
      onChangeUseJsonFixer: (v) => {
        this.aiEngine.useJsonFixer = v;
      },
      addAiCustomTag: (tagConfig) => {
        this.aiEngine.addCustomTag(tagConfig);
        if (typeof this.aiEngine.panel.bindEngineConfigTo === "function") {
          this.aiEngine.panel.bindEngineConfigTo(this.aiEngine.panel);
        }
        this.aiEngine.panel.saveSettings();
      },
      updateAiCustomTag: (index, tagConfig) => {
        this.aiEngine.updateCustomTag(index, tagConfig);
        if (typeof this.aiEngine.panel.bindEngineConfigTo === "function") {
          this.aiEngine.panel.bindEngineConfigTo(this.aiEngine.panel);
        }
        this.aiEngine.panel.saveSettings();
      },
      removeAiCustomTag: (index) => {
        this.aiEngine.removeCustomTag(index);
        if (typeof this.aiEngine.panel.bindEngineConfigTo === "function") {
          this.aiEngine.panel.bindEngineConfigTo(this.aiEngine.panel);
        }
        this.aiEngine.panel.saveSettings();
      },
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
    this.aiEngine.modelsError = "";
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
      if (
        this.aiEngine.selectedModel &&
        !models.includes(this.aiEngine.selectedModel)
      ) {
        this.aiEngine.selectedModel = "";
      }
      if (!this.aiEngine.selectedModel && models.length > 0) {
        this.aiEngine.selectedModel = models[0];
      }
      console.log("[ConfigManager] Fetched models:", models);
    } catch (error) {
      this.aiEngine.modelsError = error.message;
      console.error("[ConfigManager] Failed to fetch models:", error.message);
    } finally {
      this.aiEngine.loadingModels = false;
      this._syncPanelEngineConfig();
      if (this.aiEngine.panel && typeof this.aiEngine.panel.saveSettings === "function") {
        this.aiEngine.panel.saveSettings();
      }
    }
  }

  /**
   * Handle provider change
   * @private
   */
  _onChangeAiProvider(provider) {
    this.aiEngine.provider = provider === "gpt4all" ? "openApi" : provider;

    // Reset models and selected model
    this.aiEngine.models = [];
    this.aiEngine.selectedModel = "";

    // Adjust default host
    if (provider === "openwebui") {
      this.aiEngine.host = "http://localhost:8080";
    } else {
      this.aiEngine.host = "http://localhost:4891";
    }

    this._syncPanelEngineConfig();
  }

  /**
   * Get models endpoint
   * @private
   */
  _getModelsUrl() {
    const host = this.aiEngine.host || "http://localhost:4891";
    if (this.aiEngine.provider === "openwebui") {
      return `${host}/api/models`;
    }
    return `${host}/v1/models`;
  }

  /**
   * Get auth headers
   * @private
   */
  _getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (this.aiEngine.provider === "openwebui" && this.aiEngine.apiKey) {
      headers["Authorization"] = `Bearer ${this.aiEngine.apiKey}`;
    }
    return headers;
  }
}
