/**
 * AIEngine - Refactored Orchestrator
 * Coordinates translation pipeline using modular services
 * Main entry point: batchTranslate(items)
 */

import BaseTranslationEngine from "../BaseTranslationEngine.js";
import { TagManager } from "./TagManager.js";
import { LlmPayloadPreprocessor } from "./LlmPayloadPreprocessor.js";
import { StreamJsonParser } from "./StreamJsonParser.js";
import { StreamGuardrails } from "./StreamGuardrails.js";
import { ValidationService } from "./ValidationService.js";
import { RetryHandler } from "./RetryHandler.js";
import { ApiClient } from "./ApiClient.js";
import { ConfigManager } from "./ConfigManager.js";
import {
  DEFAULT_SYSTEM_PROMPT,
  TYPE_TO_TAG,
  buildRequestSettingsForContent,
  REQUEST_CANCEL_REASON,
} from "./constants.js";
import { stripThinkBlocks, preprocessPayloadForLlm } from "./utils.js";

class AIEngine extends BaseTranslationEngine {
  constructor(panel) {
    super(panel);

    // Configuration properties
    this.provider = "openApi";
    this.host = "http://localhost:4891";
    this.apiKey = "";
    this.selectedModel = "";
    this.models = [];
    this.loadingModels = false;
    this.modelsError = "";
    this.allowNewlineMismatch = false;
    this.askAiIfTextTranslated = true;
    this.invalidJsonHandlingStrategy = "resendFirstHalf";
    this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    this.useJsonFixer = true;
    this._aiFixRecursionMaxDepth = 0;

    // State tracking
    this._activeAbortController = null;
    this._activeRequestMeta = null;

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
          this.provider = v === "gpt4all" ? "openApi" : v;
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
          this.modelsError = v || "";
        },
      },
      aiAllowNewlineMismatch: {
        get: () => this.allowNewlineMismatch,
        set: (v) => {
          this.allowNewlineMismatch = !!v;
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
          this.invalidJsonHandlingStrategy = v || "resendFirstHalf";
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
      userJsonFixer: {
        get: () => this.useJsonFixer,
        set: (v) => {
          this.useJsonFixer = !!v;
        },
      },
    });
  }

  getId() {
    return "openApi";
  }

  getName() {
    return "AI Engine";
  }

  isFullyConfigured() {
    return !!this.selectedModel;
  }

  static getConfigTemplate() {
    // Static template for configuration UI
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
           </div>
        `;
  }

  getConfigData() {
    return this.configManager.getData();
  }

  getConfigMethods() {
    return this.configManager.getMethods();
  }

  getLanguageName(code) {
    const map = {
      ja: "Japanese",
      en: "English",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      ru: "Russian",
      ko: "Korean",
      "zh-CN": "Chinese Simplified",
      "zh-TW": "Chinese Traditional",
      pl: "Polish",
      auto: "auto",
    };
    return map[code] || code;
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
      console.warn("[AIEngine] No model selected");
      return {
        successes: [],
        failures: items.map((item) => ({ rejectReason: "No model selected" })),
      };
    }

    try {
      // 1. PREPROCESS: Tags and payload
      const itemData = items.map((item, i) => {
        const { preprocessedText, tagCounts, caseMap } =
          this.tagManager.preprocessTags(item.value || "");
        return {
          ...item,
          index: i,
          preprocessed: preprocessedText,
          tagCounts,
          caseMap,
        };
      });

      const jsonMap = {};
      itemData.forEach((item) => {
        const shortTag = TYPE_TO_TAG[item.type] || item.type;
        const key = `${shortTag}${item.index}`;
        jsonMap[key] = item.preprocessed;
      });

      const allTextForHints = itemData
        .map((item) => item.preprocessed)
        .join(" ");
      const nameHints = this.tagManager.buildNameHints(allTextForHints);
      const sourceName = this.getLanguageName(this.panel.sourceLang);
      const targetName = this.getLanguageName(this.panel.targetLang);
      const content = JSON.stringify(jsonMap);
      const expectedKeys = Object.keys(jsonMap);

      console.log(
        "[AIEngine] Batch translate items:",
        items.length,
        "JSON keys:",
        expectedKeys.length,
      );

      // 2. BUILD REQUEST PAYLOAD
      const payload = {
        model: this.selectedModel,
        messages: [
          {
            role: "system",
            content: this.systemPrompt,
          },
          {
            role: "system",
            content: `Translate video game text from ${sourceName} to ${targetName}. Return only flat one-line JSON object with exactly the same keys as input. No markdown, no comments, no extra keys, no missing keys, no duplicate keys, no arrays, no pretty formatting. Preserve every [[tag]] exactly and keep tag order unchanged. Character name hints: ${nameHints}`,
          },
          {
            role: "user",
            content: `{"${TYPE_TO_TAG.text}0":"それはいいですね","${TYPE_TO_TAG.text}1":"情報\\nありがとうございます。"}`,
          },
          {
            role: "assistant",
            content: `{"${TYPE_TO_TAG.text}0":"That's great","${TYPE_TO_TAG.text}1":"Thank you for the information"}`,
          },
          {
            role: "user",
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

      if (!streamResult.text && !streamResult.bestMap) {
        console.warn("[AIEngine] Batch returned no content");
        return {
          successes: [],
          failures: items.map((item) => ({
            ...item,
            rejectReason: "No content",
          })),
        };
      }

      let rawTranslated = streamResult.text || "";
      let translatedMap = null;

      // 4. PARSE JSON
      const streamPartialMatchedKeys = StreamGuardrails.countMatchedKeys(
        streamResult.bestMap,
        expectedKeys,
      );
      if (streamPartialMatchedKeys > 0) {
        translatedMap = streamResult.bestMap;
      }

      const guardrailPartialMap = !!(
        streamResult.cancelledByGuardrail &&
        translatedMap &&
        !StreamGuardrails.isMapComplete(translatedMap, expectedKeys)
      );

      try {
        if (!translatedMap) {
          translatedMap = StreamJsonParser.parseObjectStrict(
            StreamJsonParser.extractJsonLike(rawTranslated),
          );
        }
      } catch (parseError) {
        console.error(
          "[AIEngine] Failed to parse JSON response:",
          parseError.message,
        );

        // Try stream guardrail partial
        if (streamResult.cancelledByGuardrail && streamPartialMatchedKeys > 0) {
          translatedMap = streamResult.bestMap;
          rawTranslated = JSON.stringify(streamResult.bestMap);
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
                rejectReason:
                  streamResult.cancelReason || "Invalid JSON response",
              })),
            };
          }

          if (retryResult.merged) {
            return retryResult.merged;
          }

          // Try to parse retry response
          try {
            translatedMap = StreamJsonParser.parseObjectStrict(
              StreamJsonParser.extractJsonLike(
                retryResult.response || retryResult.repaired,
              ),
            );
            rawTranslated =
              retryResult.response || JSON.stringify(retryResult.repaired);
          } catch (retryParseError) {
            console.error(
              "[AIEngine] Retry parse failed:",
              retryParseError.message,
            );
            return {
              successes: [],
              failures: items.map((item) => ({
                ...item,
                rejectReason: "Invalid JSON after retry",
              })),
            };
          }
        }
      }

      // 5. VALIDATION
      const shapeCheck = this.validationService.validateTranslatedMapShape(
        translatedMap,
        itemData,
      );
      if (!shapeCheck.valid && !guardrailPartialMap) {
        console.warn(
          "[AIEngine] Response JSON has invalid shape:",
          shapeCheck.errors,
        );
        return {
          successes: [],
          failures: items.map((item) => ({
            ...item,
            rejectReason: `Invalid response shape: ${shapeCheck.errors[0]}`,
          })),
        };
      }

      if (
        !guardrailPartialMap &&
        shapeCheck.valid &&
        this.askAiIfTextTranslated
      ) {
        console.log("[AIEngine] Validating response language...");
        const validationText =
          this.validationService.buildValidationTextFromMap(
            translatedMap,
            itemData,
          );
        const langValidation =
          await this.validationService.validateResponseLanguage(
            validationText,
            targetName,
            sourceName,
            isBackgroundJob,
          );

        if (!langValidation.isTranslated) {
          console.log(
            "[AIEngine] Language validation failed, retry count limited",
          );
          // Fail open rather than retry infinitely
        }
      }

      // 6. POSTPROCESS & WRAP
      const successes = [];
      const failures = [];

      for (const itemD of itemData) {
        const shortTag = TYPE_TO_TAG[itemD.type] || itemD.type;
        const key = `${shortTag}${itemD.index}`;
        const rawSlice = translatedMap[key];

        if (rawSlice === undefined || rawSlice === null) {
          failures.push({
            type: itemD.type,
            id: itemD.id,
            value: itemD.value,
            cacheKey: itemD.cacheKey,
            rejectReason: `Missing key "${key}"`,
          });
          continue;
        }

        if (typeof rawSlice !== "string") {
          failures.push({
            ...itemD,
            rejectReason: `Value for "${key}" is not a string`,
          });
          continue;
        }

        // Postprocess tags
        const postprocessResult = this.tagManager.postprocessTags(
          rawSlice,
          itemD.tagCounts,
          itemD.caseMap,
        );
        if (!postprocessResult.valid) {
          failures.push({
            ...itemD,
            rejectReason: "Tag count mismatch",
          });
          continue;
        }

        let finalTranslated = postprocessResult.text;
        const isDescriptionType =
          typeof itemD.type === "string" && itemD.type.endsWith("_description");

        if (
          itemD.type === "text" ||
          itemD.type === "choice" ||
          isDescriptionType
        ) {
          const maxWidth = isDescriptionType
            ? this.panel.descriptionMaxLineWidth || this.panel.maxLineWidth
            : this.panel.maxLineWidth;
          finalTranslated = this.wrapText(
            this.cleanTranslatedText(finalTranslated),
            maxWidth,
          );
        } else if (itemD.type === "speaker") {
          finalTranslated = this.normalizeSpeakerNameCase(finalTranslated);
        }

        successes.push({
          type: itemD.type,
          id: itemD.id,
          value: itemD.value,
          translated: finalTranslated,
          cacheKey: itemD.cacheKey,
        });
      }

      console.log(
        `[AIEngine] Batch complete: ${successes.length} successes, ${failures.length} failures`,
      );
      return { successes, failures };
    } catch (error) {
      console.error("[AIEngine] Batch translate error:", error.message);
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
    const expectedKeys = options.expectedKeys || [];
    const isBackgroundJob = !!options.isBackgroundJob;

    const controller = new AbortController();
    this._activeAbortController = controller;
    this._activeRequestMeta = { isBackgroundJob, startedAt: Date.now() };

    try {
      // Preprocess payload
      const processedPayload = preprocessPayloadForLlm(payload);

      const response = await fetch(this.getChatUrl(), {
        method: "POST",
        headers: this.getRequestHeaders(),
        body: JSON.stringify(processedPayload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Parse streaming response
      const monitorState = StreamGuardrails.createMonitorState(expectedKeys);
      let rawText = "";

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        rawText += chunk;

        // Check guardrails periodically
        const guardrailResult = StreamGuardrails.checkGuardrails(
          monitorState,
          rawText,
          false,
        );
        if (guardrailResult.shouldCancel) {
          console.warn(
            "[AIEngine] Stream guardrail triggered:",
            guardrailResult.cancelReason,
          );
          controller.abort();
          break;
        }
      }

      // Strip think blocks if present
      const { text: cleanedText } = stripThinkBlocks(rawText);

      return {
        text: cleanedText,
        bestMap: monitorState.bestMap,
        cancelledByGuardrail: !!monitorState.cancelReason,
        cancelReason: monitorState.cancelReason,
      };
    } catch (error) {
      if (error.name === "AbortError") {
        return {
          text: "",
          bestMap: null,
          cancelledByGuardrail: true,
          cancelReason: REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED,
        };
      }
      throw error;
    } finally {
      this._activeAbortController = null;
      this._activeRequestMeta = null;
    }
  }

  getChatUrl() {
    const host = (
      this.host ||
      (this.provider === "openwebui"
        ? "http://localhost:8080"
        : "http://localhost:4891")
    ).replace(/\/$/, "");
    return this.provider === "openwebui"
      ? `${host}/api/chat/completions`
      : `${host}/v1/chat/completions`;
  }

  getRequestHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (this.provider === "openwebui" && this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
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
        console.warn("[AIEngine] Cancel failed:", e.message);
      }
    }
    return false;
  }
}

export default AIEngine;
