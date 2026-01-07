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
        throw new Error('getId() must be implemented');
    }

    /**
     * Get human-readable engine name
     * @returns {string}
     */
    getName() {
        throw new Error('getName() must be implemented');
    }

    /**
     * Batch translate items (texts, speakers, choices)
     * @param {Array} items - Array of {type, id, value, cacheKey} objects
     * @returns {Promise<{successes: Array, failures: Array}>}
     */
    async batchTranslate(items) {
        throw new Error('batchTranslate() must be implemented');
    }

    /**
     * Get Vue template for engine-specific configuration UI
     * @returns {string} Vue template HTML
     */
    getConfigTemplate() {
        return ''; // Default: no additional config
    }

    /**
     * Get data properties for engine-specific configuration
     * @returns {object}
     */
    getConfigData() {
        return {}; // Default: no additional data
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
    getCacheKey(text, type = 'text') {
        return this.panel.getCacheKey(text, type);
    }

    setCacheValue(key, value) {
        return this.panel.setCacheValue(key, value);
    }

    wrapText(text, maxWidth) {
        return this.panel.wrapText(text, maxWidth);
    }

    cleanTranslatedText(text) {
        return this.panel.cleanTranslatedText(text);
    }

    normalizeSpeakerNameCase(name) {
        return this.panel.normalizeSpeakerNameCase(name);
    }
}
