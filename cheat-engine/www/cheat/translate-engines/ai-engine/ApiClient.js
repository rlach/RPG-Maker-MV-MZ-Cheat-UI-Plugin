/**
 * ApiClient
 * HTTP communication with LLM endpoints
 * Handles both OpenAPI-compatible and Open WebUI providers
 */

export class ApiClient {
  /**
   * Create API client
   * @param {Object} config - {provider, host, apiKey}
   */
  constructor(config = {}) {
    this.provider = config.provider || "openApi";
    this.host = config.host || "http://localhost:4891";
    this.apiKey = config.apiKey || "";
    this.activeController = null;
    this.activeRequestMeta = null;
  }

  /**
   * Get models endpoint URL
   * @returns {string}
   */
  getModelsEndpoint() {
    const baseUrl = this.host || "http://localhost:4891";
    if (this.provider === "openwebui") {
      return `${baseUrl}/api/models`;
    }
    return `${baseUrl}/v1/models`;
  }

  /**
   * Get chat completion endpoint URL
   * @returns {string}
   */
  getChatEndpoint() {
    const baseUrl = this.host || "http://localhost:4891";
    if (this.provider === "openwebui") {
      return `${baseUrl}/api/chat/completions`;
    }
    return `${baseUrl}/v1/chat/completions`;
  }

  /**
   * Build request headers
   * @param {boolean} isAuth - Include Authorization header
   * @returns {Object}
   */
  buildHeaders(isAuth = false) {
    const headers = {
      "Content-Type": "application/json",
    };

    if (isAuth && this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Create abort controller for request cancellation
   * @returns {AbortController}
   */
  createAbortController() {
    this.activeController = new AbortController();
    return this.activeController;
  }

  /**
   * Check if error is due to request abort
   * @param {Error} error - Error object
   * @returns {boolean}
   */
  isAbortedError(error) {
    return error?.name === "AbortError" || error?.message?.includes("abort");
  }

  /**
   * Extract text from message object
   * @param {Object} message - Message object
   * @returns {string}
   */
  extractMessageText(message) {
    if (!message || typeof message !== "object") {
      return "";
    }
    return message.content || message.reasoning_content || "";
  }

  /**
   * Extract streaming delta text from event
   * @param {Object} event - SSE event object (parsed JSON)
   * @returns {string}
   */
  extractStreamingDelta(event) {
    if (!event) {
      return "";
    }

    // OpenAI format
    if (event.choices && Array.isArray(event.choices) && event.choices[0]) {
      const delta = event.choices[0].delta;
      if (delta && (delta.content || delta.reasoning_content)) {
        return delta.content || delta.reasoning_content || "";
      }
    }

    // Fallback
    return "";
  }

  /**
   * Set meta information for active request
   * @param {Object} meta - {isBackgroundJob, externalCancelReason, startedAt}
   */
  setRequestMeta(meta) {
    this.activeRequestMeta = meta;
  }

  /**
   * Get active request meta
   * @returns {Object}
   */
  getRequestMeta() {
    return this.activeRequestMeta || {};
  }

  /**
   * Abort active request
   */
  abortRequest() {
    if (this.activeController) {
      this.activeController.abort();
    }
  }

  /**
   * Check if there's an active background request
   * @returns {boolean}
   */
  hasActiveBackgroundRequest() {
    return (
      this.activeRequestMeta?.isBackgroundJob === true &&
      this.activeController !== null
    );
  }

  /**
   * Clear request state
   */
  clearRequestState() {
    this.activeController = null;
    this.activeRequestMeta = null;
  }
}
