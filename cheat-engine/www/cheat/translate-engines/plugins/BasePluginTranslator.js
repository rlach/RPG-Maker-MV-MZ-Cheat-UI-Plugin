import { BasePhase } from '../translation-phases/BasePhase.js';
import { shouldApplyHook } from '../../js/HookGuardHelper.js';

export class BasePluginTranslator extends BasePhase {
    constructor() {
        super();
        this._pluginDetected = false;
        this._detectionChecked = false;
    }

    /**
     * @returns {string}
     */
    getPluginName() {
        throw new Error('getPluginName() must be implemented by plugin translator');
    }

    /**
     * @returns {string}
     */
    getPluginLabel() {
        return this.getPluginName();
    }

    getKind() {
        const normalized = String(this.getPluginName() || 'plugin')
            .trim()
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, '-')
            .replaceAll(/(^-|-$)/g, '');
        return `plugin:${normalized || 'unknown'}`;
    }

    getTranslationPhaseLabel() {
        return `translating plugin ${this.getPluginLabel()}`;
    }

    detectPlugin() {
        const pluginName = String(this.getPluginName() || '')
            .trim()
            .toLowerCase();
        if (!pluginName || !Array.isArray(window.$plugins)) {
            return false;
        }

        return window.$plugins.some((plugin) => {
            if (!plugin || typeof plugin.name !== 'string') {
                return false;
            }

            return plugin.name.trim().toLowerCase() === pluginName;
        });
    }

    enablePluginTranslation() {
        // Optional hook point for plugin-specific runtime integration.
    }

    /**
     * Called after a translation batch completes, allowing plugin translators
     * to extract domain-specific knowledge from the batch results.
     * Override in subclasses to populate the knowledge base.
     * @param {Object} _query - The batch query context (pendingItems, options, etc.)
     * @param {Object} _response - The batch response (successes, failures, batchMeta)
     */
    manageKnowledgeBase(_query, _response) {
        // No-op by default. Plugin translators can override.
    }

    /**
     * Generate unique hook guard name for this plugin translator
     * @private
     * @returns {string} Hook name (e.g., 'PLUGIN_MY_PLUGIN_TRANSLATOR_HOOK')
     */
    _getPluginHookName() {
        const pluginName = String(this.getPluginName() || 'unknown')
            .trim()
            .toUpperCase()
            .replaceAll(/[^A-Z0-9]+/g, '_')
            .replaceAll(/(^_|_$)/g, '');

        return `PLUGIN_${pluginName}_HOOK`;
    }

    /**
     * Register XML-style plugin tag configs with the active translation engine.
     * Call this inside enablePluginTranslation() to automatically protect plugin-specific
     * tags during LLM translation (they are encoded/decoded rather than passed raw).
     *
     * @param {Array} tagConfigs - Array of tag config objects (same shape as TAG_CONFIGS entries,
     *   plus style:"xml" and bracket:"none" for XML-colon-separator tags).
     */
    registerPluginCustomTags(tagConfigs) {
        if (!Array.isArray(tagConfigs) || tagConfigs.length === 0) {
            return;
        }

        const runtime =
            window.__ensureTranslationRuntime?.() || window.__TranslationRuntime || null;

        if (typeof runtime?.engine?.addPluginTags !== 'function') {
            return;
        }

        runtime.engine.addPluginTags(this.getPluginName(), tagConfigs);
    }

    prepareTranslator(_context = {}) {
        // Optional hook point for plugin-specific one-time async preparation.
        return Promise.resolve();
    }

    /**
     * @param {object} _context
     * @returns {string|null}
     */
    resolveMessageCacheSourceText(_context = {}) {
        // Optional hook point for plugin-specific message cache key normalization.
        return null;
    }

    ensureDetection() {
        if (this._detectionChecked) {
            return this._pluginDetected;
        }

        this._pluginDetected = !!this.detectPlugin();
        this._detectionChecked = true;

        if (this._pluginDetected) {
            try {
                // Use hook guard to prevent re-initialization if this translator runs in separate window
                if (!shouldApplyHook(this._getPluginHookName())) {
                    return this._pluginDetected;
                }

                this.enablePluginTranslation();
            } catch (error) {
                console.warn(
                    `[PluginTranslator] Failed to enable plugin translation for ${this.getPluginName()}`,
                    error
                );
            }
        }

        return this._pluginDetected;
    }

    isDetected() {
        return this.ensureDetection();
    }

    isActive(context = {}) {
        const runtime = context?.runtime;
        if (!this.ensureDetection()) {
            return false;
        }

        if (runtime && typeof runtime.isPluginTranslatorEnabled === 'function') {
            return !!runtime.isPluginTranslatorEnabled(this.getPluginName());
        }

        return true;
    }

    async createEntries(context = {}) {
        if (!this.isActive(context)) {
            return [];
        }

        const counts = this.countAmountSync(context);
        const leftStrings = Math.max(0, Number(counts?.leftStrings || counts?.left || 0));
        if (leftStrings <= 0) {
            return [];
        }

        return [{ priorityMapId: 0, strategy: this }];
    }

    countAmountSync(context = {}) {
        if (!this.ensureDetection()) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        return (
            this.countPluginAmountSync(context) || {
                total: 0,
                left: 0,
                totalStrings: 0,
                leftStrings: 0,
            }
        );
    }

    countPluginAmountSync(_context = {}) {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    static _resolveGlobalRuntime() {
        return globalThis.__ensureTranslationRuntime?.() || globalThis.__TranslationRuntime || null;
    }

    static ensureGlobalRuntimeContract() {
        const runtime = BasePluginTranslator._resolveGlobalRuntime();
        return BasePluginTranslator.ensureRuntimeContract(runtime);
    }

    static ensureRuntimeContract(runtime) {
        if (!runtime || typeof runtime !== 'object') {
            return null;
        }

        if (runtime.__CHEAT_RUNTIME_CONTRACT_READY__) {
            return runtime;
        }

        if (!(runtime.translationCache instanceof Map)) {
            runtime.translationCache = new Map();
        }

        if (typeof runtime.isTranslationEnabled !== 'function') {
            runtime.isTranslationEnabled = function () {
                return !!this.enabled;
            };
        }

        if (typeof runtime.trackCacheKeyUsage !== 'function') {
            runtime.trackCacheKeyUsage = function () {};
        }

        if (typeof runtime.hasUsableCacheValue !== 'function') {
            runtime.hasUsableCacheValue = function (cacheKey) {
                if (!(this.translationCache instanceof Map)) {
                    return false;
                }

                const value = this.translationCache.get(cacheKey);
                return typeof value === 'string' && !!value.trim();
            };
        }

        if (typeof runtime.cleanTranslatedText !== 'function') {
            runtime.cleanTranslatedText = function (text) {
                return String(text ?? '');
            };
        }

        if (typeof runtime.wrapText !== 'function') {
            runtime.wrapText = function (text) {
                return String(text ?? '');
            };
        }

        if (typeof runtime.hasCurrentMessagePortrait !== 'function') {
            runtime.hasCurrentMessagePortrait = function () {
                return false;
            };
        }

        Object.defineProperty(runtime, '__CHEAT_RUNTIME_CONTRACT_READY__', {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return runtime;
    }

    /**
     * Canonical helper to validate if a value is usable text for translation.
     * @param {*} value - Value to check
     * @returns {boolean} True if value is a non-empty string
     */
    isUsableText(value) {
        return typeof value === 'string' && value.trim() !== '';
    }

    getRuntime() {
        return BasePluginTranslator.ensureGlobalRuntimeContract();
    }

    isRuntimeTranslationActive(runtime = this.getRuntime()) {
        if (!runtime) {
            return false;
        }

        const translationEnabled = !!(runtime.isTranslationEnabled() || runtime.enabled);
        return translationEnabled || !!runtime.translateCacheWhenDisabled;
    }
}
