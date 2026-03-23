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

  parseTranslatedMapFromText(text, expectedKeys = []) {
    const merged = StreamJsonParser.mergeTopLevelObjects(text);
    if (merged && typeof merged === "object") {
      return merged;
    }

    return StreamJsonParser.parseObjectStrict(
      StreamJsonParser.extractBestJsonLike(text, expectedKeys),
    );
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
        const shortTag = TYPE_TO_TAG[item.type] || item.type;
        return {
          ...item,
          index: i,
          jsonKey: `${shortTag}${i}`,
          preprocessed: preprocessedText,
          tagCounts,
          caseMap,
        };
      });

      const jsonMap = {};
      itemData.forEach((item) => {
        jsonMap[item.jsonKey] = item.preprocessed;
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
        const cancelReason = streamResult.cancelReason || null;
        const preempted =
          cancelReason === REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED;
        return {
          successes: [],
          failures: items.map((item) => ({
            ...item,
            rejectReason: cancelReason || "No content",
            cancelReason,
            preempted,
          })),
        };
      }

      let rawTranslated = streamResult.text || "";
      let translatedMap = null;
      let usedStreamFallback = false;

      // 4. PARSE JSON
      const streamPartialMatchedKeys = StreamGuardrails.countMatchedKeys(
        streamResult.bestMap,
        expectedKeys,
      );
      const streamBestMapComplete = StreamGuardrails.isMapComplete(
        streamResult.bestMap,
        expectedKeys,
      );
      if (streamBestMapComplete) {
        translatedMap = streamResult.bestMap;
        usedStreamFallback = true;
      }

      const guardrailPartialMap = !!(
        streamResult.cancelledByGuardrail &&
        streamResult.bestMap &&
        !streamBestMapComplete
      );

      try {
        if (!translatedMap) {
          translatedMap = this.parseTranslatedMapFromText(
            rawTranslated,
            expectedKeys,
          );
        }
      } catch (parseError) {
        console.error(
          "[AIEngine] Failed to parse JSON response:",
          parseError.message,
        );

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
                rejectReason:
                  streamResult.cancelReason || "Invalid JSON response",
                cancelReason: streamResult.cancelReason || null,
                preempted:
                  streamResult.cancelReason ===
                  REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED,
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
              expectedKeys,
            );
            rawTranslated =
              retryResult.response || JSON.stringify(retryResult.repaired);
          } catch (retryParseError) {
            console.error(
              "[AIEngine] Retry parse failed:",
              retryParseError.message,
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
                  rejectReason: "Invalid JSON after retry",
                })),
              };
            }
          }
        }
      }

      // 5. VALIDATION
      let shapeCheck = this.validationService.validateTranslatedMapShape(
        translatedMap,
        itemData,
      );
      translatedMap = shapeCheck.normalizedMap || translatedMap;

      if (
        !shapeCheck.valid &&
        !usedStreamFallback &&
        streamPartialMatchedKeys
      ) {
        translatedMap = streamResult.bestMap;
        rawTranslated = JSON.stringify(streamResult.bestMap);
        usedStreamFallback = true;
        shapeCheck = this.validationService.validateTranslatedMapShape(
          translatedMap,
          itemData,
        );
        translatedMap = shapeCheck.normalizedMap || translatedMap;
      }

      if (!shapeCheck.valid && !guardrailPartialMap && !usedStreamFallback) {
        console.warn(
          "[AIEngine] Response JSON has invalid shape:",
          shapeCheck.errors,
        );
        const missingKeySet = new Set(shapeCheck.missingKeys || []);
        const nonStringKeySet = new Set(shapeCheck.nonStringKeys || []);
        return {
          successes: [],
          failures: items.map((item, idx) => {
            const mappedItem = itemData[idx] || item;
            const key =
              mappedItem.jsonKey ||
              `${TYPE_TO_TAG[mappedItem.type] || mappedItem.type}${mappedItem.index || 0}`;

            let reason = shapeCheck.errors[0] || "Invalid response shape";
            if (missingKeySet.has(key)) {
              reason = `Missing key: ${key}`;
            } else if (nonStringKeySet.has(key)) {
              reason = `Key \"${key}\" is not a string`;
            }

            return {
              ...item,
              rejectReason: `Invalid response shape: ${reason}`,
            };
          }),
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
        const key =
          itemD.jsonKey ||
          `${TYPE_TO_TAG[itemD.type] || itemD.type}${itemD.index}`;
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
    return this.enqueueRequest(async () => {
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

      const contentType = (
        response.headers.get("content-type") || ""
      ).toLowerCase();
      const isEventStream = contentType.includes("text/event-stream");

      if (!isEventStream) {
        const rawBodyText = await response.text();
        const assistantText =
          this.extractAssistantTextFromApiResponse(rawBodyText);
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
      let contentText = ""; // accumulated assistant content only
      let sseBuffer = ""; // buffer for partial SSE lines

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        sseBuffer += chunk;

        // Process complete SSE lines
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop(); // last element may be incomplete

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data:")) continue;
          try {
            const dataPayload = trimmed.slice(5).trim();
            if (!dataPayload || dataPayload === "[DONE]") continue;
            const json = JSON.parse(dataPayload);
            const delta = json?.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
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
      const { text: cleanedText } = stripThinkBlocks(contentText);

      return {
        text: cleanedText,
        bestMap: monitorState.bestMap,
        cancelledByGuardrail: !!monitorState.cancelReason,
        cancelReason: monitorState.cancelReason,
      };
    } catch (error) {
      if (error.name === "AbortError") {
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
          text: "",
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
      (this.provider === "openwebui"
        ? "http://localhost:8080"
        : "http://localhost:4891")
    ).replace(/\/$/, "");
    return this.provider === "openwebui"
      ? `${host}/api/chat/completions`
      : `${host}/v1/chat/completions`;
  }

  extractAssistantTextFromApiResponse(rawBodyText) {
    if (typeof rawBodyText !== "string" || rawBodyText.trim() === "") {
      return "";
    }

    try {
      const parsed = JSON.parse(rawBodyText);

      if (typeof parsed === "string") {
        return parsed;
      }

      if (!parsed || typeof parsed !== "object") {
        return rawBodyText;
      }

      if (parsed.message && typeof parsed.message.content === "string") {
        return parsed.message.content;
      }

      if (typeof parsed.response === "string") {
        return parsed.response;
      }

      if (typeof parsed.content === "string") {
        return parsed.content;
      }

      if (typeof parsed.output_text === "string") {
        return parsed.output_text;
      }

      const firstChoice =
        parsed && Array.isArray(parsed.choices) ? parsed.choices[0] : null;
      if (firstChoice) {
        const messageContent =
          firstChoice.message && typeof firstChoice.message.content === "string"
            ? firstChoice.message.content
            : null;
        if (messageContent !== null) {
          return messageContent;
        }

        const textContent =
          typeof firstChoice.text === "string" ? firstChoice.text : null;
        if (textContent !== null) {
          return textContent;
        }
      }
    } catch (e) {
      // Not a JSON envelope, treat body as direct text response.
    }

    return rawBodyText;
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
