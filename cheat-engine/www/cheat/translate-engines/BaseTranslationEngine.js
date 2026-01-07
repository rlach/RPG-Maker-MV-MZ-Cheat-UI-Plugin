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
     * Batch translate messages and speakers
     * @param {Array} entries - Array of {text, cacheKey, speaker} objects
     * @param {Array} speakers - Array of speaker names to translate
     * @returns {Promise<void>}
     */
    async batchTranslateMessagesAndSpeakers(entries, speakers) {
        throw new Error('batchTranslateMessagesAndSpeakers() must be implemented');
    }

    /**
     * Batch translate choices
     * @param {Array} choices - Array of choice texts
     * @param {string} choiceKey - Cache key for the choice set
     * @returns {Promise<{choices: Array, complete: boolean}>}
     */
    async batchTranslateChoices(choices, choiceKey) {
        throw new Error('batchTranslateChoices() must be implemented');
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

    showSpinner() {
        return this.panel.showSpinner();
    }

    hideSpinner() {
        return this.panel.hideSpinner();
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
