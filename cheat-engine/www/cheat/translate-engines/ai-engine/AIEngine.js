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
  TAG_BRACKET_OPTIONS,
  TAG_TYPE_OPTIONS,
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
    this.customTags = [];
    this.customTagTypeOptions = [...TAG_TYPE_OPTIONS];
    this.customTagBracketOptions = [...TAG_BRACKET_OPTIONS];

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
      description: String(config.description || "").trim(),
      type: String(config.type || ""),
      tagSymbol: String(config.tagSymbol || "").trim(),
      requiredConsistency: !!config.requiredConsistency,
    };

    if (normalized.type === "withCustomParameter") {
      normalized.bracket = String(config.bracket || "<");
      normalized.maskValue = !!config.maskValue;
    }

    return normalized;
  }

  setCustomTags(tags) {
    const safeTags = Array.isArray(tags) ? tags : [];
    this.customTags = safeTags.map((tag) => this.normalizeCustomTagConfig(tag));
    this.tagManager.setCustomTagConfigs(this.customTags);
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
    return "openApi";
  }

  getName() {
    return "AI Engine";
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

  buildCompactJsonKey(item, fallbackIndex) {
    const safeItem = item || {};
    const rawType = String(safeItem.type || "").toLowerCase();

    // Keep message/speaker/choice compact and sequential as before.
    if (rawType === "text" || rawType === "speaker" || rawType === "choice") {
      return `${TYPE_TO_TAG[rawType] || "m"}${fallbackIndex}`;
    }

    const match = rawType.match(/^([a-z0-9]+)_(.+)$/);
    if (!match) {
      return `${TYPE_TO_TAG[rawType] || "m"}${fallbackIndex}`;
    }

    const baseType = match[1];
    const field = match[2];

    const baseMap = {
      item: "i",
      skill: "s",
      armor: "a",
      weapon: "w",
      class: "c",
      enemy: "e",
      actor: "r",
      map: "mp",
      state: "st",
    };

    const fieldMap = {
      name: "n",
      description: "d",
      note: "t",
      nickname: "nn",
      profile: "p",
      message1: "m1",
      message2: "m2",
    };

    const shortBase = baseMap[baseType] || baseType.slice(0, 1) || "x";
    const shortField = fieldMap[field] || field.slice(0, 2) || "v";

    if (!this._jsonObjectIndexByType) {
      this._jsonObjectIndexByType = new Map();
    }
    if (!this._jsonObjectSequenceByType) {
      this._jsonObjectSequenceByType = new Map();
    }

    let objectKey = String(safeItem.id || "");
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
      this.tagManager.allowNewlineMismatch = this.allowNewlineMismatch;
      this._jsonObjectIndexByType = new Map();
      this._jsonObjectSequenceByType = new Map();
      const itemData = items.map((item, i) => {
        const { preprocessedText, tagCounts, caseMap } =
          this.tagManager.preprocessTags(item.value || "");
        return {
          ...item,
          index: i,
          jsonKey: this.buildCompactJsonKey(item, i),
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
            content: `Translate video game text from ${sourceName} to ${targetName}. Return only flat one-line JSON object with exactly the same keys as input. No markdown, no comments, no extra keys, no missing keys, no duplicate keys, no arrays, no pretty formatting. Preserve every [b=tag] exactly and keep tag order unchanged. The only exception are tags with <values> like this - [b=na<しえる>]. In this case the <value> can be translated, but otherwise don't modify the tag. Keys with the same prefix+index are context-linked fields of one entity (example: i0n and i0d are the same item's name and description), so translate them consistently. Character name hints: ${nameHints}`,
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

      const cancelReason = streamResult.cancelReason || null;
      const preempted =
        cancelReason === REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED;
      const shouldPreserveCancelReason =
        !!cancelReason &&
        cancelReason !== REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED &&
        cancelReason !== REQUEST_CANCEL_REASON.REQUEST_ABORTED;

      if (!streamResult.text && !streamResult.bestMap) {
        // Keep preemption behavior explicit, but allow guardrail/no-content paths
        // to fall through to retry strategies (e.g. split in half).
        if (
          preempted ||
          cancelReason === REQUEST_CANCEL_REASON.REQUEST_ABORTED
        ) {
          console.warn("[AIEngine] Batch returned no content");
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

      const guardrailPartialMap = !!(
        streamResult.cancelledByGuardrail &&
        streamResult.bestMap &&
        !streamBestMapComplete
      );

      try {
        // Final stream text has priority over any guardrail snapshot.
        translatedMap = this.parseTranslatedMapFromText(
          rawTranslated,
          expectedKeys,
        );
      } catch (parseError) {
        console.error(
          "[AIEngine] Failed to parse JSON response:",
          parseError.message,
        );

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
                  rejectReason: cancelReason || "Invalid JSON response",
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
              expectedKeys,
            );
            rawTranslated =
              retryResult.response || JSON.stringify(retryResult.repaired);
            shapeCheck = this.validationService.validateTranslatedMapShape(
              translatedMap,
              itemData,
            );
            translatedMap = shapeCheck.normalizedMap || translatedMap;
          } catch (retryParseError) {
            console.error(
              "[AIEngine] Retry parse failed after shape error:",
              retryParseError.message,
            );
          }
        }

        if (shapeCheck.valid) {
          // Continue normal post-processing path with repaired response.
        } else {
          console.warn(
            "[AIEngine] Response JSON has invalid shape:",
            shapeCheck.errors,
          );
          return {
            successes: [],
            failures: items.map((item, idx) => {
              const mappedItem = itemData[idx] || item;
              const missingKeySet = new Set(shapeCheck.missingKeys || []);
              const nonStringKeySet = new Set(shapeCheck.nonStringKeys || []);
              const key =
                mappedItem.jsonKey ||
                `${TYPE_TO_TAG[mappedItem.type] || mappedItem.type}${mappedItem.index || 0}`;

              let reason = "Invalid response shape";
              if (missingKeySet.has(key)) {
                reason = "Missing key";
              } else if (nonStringKeySet.has(key)) {
                reason = "Key is not a string";
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
            rejectReason: "Missing key",
            cancelReason: shouldPreserveCancelReason ? cancelReason : null,
          });
          continue;
        }

        if (typeof rawSlice !== "string") {
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
          itemD.caseMap,
        );
        if (!postprocessResult.valid) {
          failures.push({
            ...itemD,
            rejectReason: postprocessResult.errorReason || "Tag count mismatch",
            cancelReason: shouldPreserveCancelReason ? cancelReason : null,
          });
          continue;
        }

        const finalTranslated = this.postprocessTranslatedItem(
          itemD,
          postprocessResult.text,
        );

        successes.push({
          type: itemD.type,
          id: itemD.id,
          value: itemD.value,
          translated: finalTranslated,
          cacheKey: itemD.cacheKey,
        });
      }

      if (
        successes.length === 0 &&
        failures.length > 0 &&
        shouldPreserveCancelReason
      ) {
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
            this._activeRequestMeta &&
            this._activeRequestMeta.externalCancelReason
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
