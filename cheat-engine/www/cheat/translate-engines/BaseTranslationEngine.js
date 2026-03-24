/**
 * Base class for translation engines
 * All engines must implement these methods
 */
export default class BaseTranslationEngine {
  constructor(panel) {
    this.panel = panel; // Reference to TranslateOnTheFlyPanel for cache, settings, etc.
  }

  /**
   * Get engine identifier
   * @returns {string}
   */
  getId() {
    throw new Error("getId() must be implemented");
  }

  /**
   * Get human-readable engine name
   * @returns {string}
   */
  getName() {
    throw new Error("getName() must be implemented");
  }

  /**
   * Batch translate items (texts, speakers, choices)
   * @param {Array} items - Array of {type, id, value, cacheKey} objects
   * @returns {Promise<{successes: Array, failures: Array}>}
   */
  async batchTranslate(items) {
    throw new Error("batchTranslate() must be implemented");
  }

  /**
   * Get Vue template for engine-specific configuration UI
   * @returns {string} Vue template HTML
   */
  getConfigTemplate() {
    return ""; // Default: no additional config
  }

  /**
   * Get data properties for engine-specific configuration
   * @returns {object}
   */
  getConfigData() {
    return {}; // Default: no additional data
  }

  /**
   * Check if engine is fully configured
   * @returns {boolean}
   */
  isFullyConfigured() {
    // Default: assume fully configured
    // Override in subclasses if additional configuration is required
    return true;
  }

  /**
   * Get methods for engine-specific configuration
   * @returns {object}
   */
  getConfigMethods() {
    return {}; // Default: no additional methods
  }

  /**
   * Initialize engine (called when selected)
   */
  async initialize() {
    // Override if needed
  }

  /**
   * Cleanup engine (called when deselected)
   */
  async cleanup() {
    // Override if needed
  }

  // Helper methods available to all engines
  getCacheKey(text, type = "text") {
    return this.panel.getCacheKey(text, type);
  }

  setCacheValue(key, value) {
    return this.panel.setCacheValue(key, value);
  }

  wrapText(text, maxWidth, options = {}) {
    return this.panel.wrapText(text, maxWidth, options);
  }

  cleanTranslatedText(text) {
    return this.panel.cleanTranslatedText(text);
  }

  normalizeSpeakerNameCase(name) {
    return this.panel.normalizeSpeakerNameCase(name);
  }

  isDescriptionType(type) {
    return typeof type === "string" && type.endsWith("_description");
  }

  getWrapConfigForType(type) {
    const isDescription = this.isDescriptionType(type);
    const maxWidth = isDescription
      ? this.panel.descriptionMaxLineWidth || this.panel.maxLineWidth
      : this.panel.maxLineWidth;
    const wrapOptions = isDescription
      ? { flattenExistingNewlines: true }
      : undefined;
    return { isDescription, maxWidth, wrapOptions };
  }

  postprocessTranslatedItem(item, translated) {
    const itemType = item && item.type;
    const value = typeof translated === "string" ? translated : "";
    const { isDescription, maxWidth, wrapOptions } =
      this.getWrapConfigForType(itemType);

    if (itemType === "text" || itemType === "choice" || isDescription) {
      return this.wrapText(
        this.cleanTranslatedText(value),
        maxWidth,
        wrapOptions,
      );
    }

    if (itemType === "speaker") {
      return this.normalizeSpeakerNameCase(value);
    }

    return value;
  }
}
