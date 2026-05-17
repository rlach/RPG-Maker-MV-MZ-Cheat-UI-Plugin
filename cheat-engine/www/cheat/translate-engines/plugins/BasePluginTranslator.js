import { BasePhase } from '../translation-phases/BasePhase.js';
import { shouldApplyHook } from '../../js/HookGuardHelper.js';
import { Alert } from '../../js/AlertHelper.js';

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

    getCacheType() {
        return 'plugin';
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
        // Return false if integration is not yet ready and should be retried after a delay.
        // Never fail silently, either throw or return false to trigger retry, to ensure issues are visible in logs.
        return true;
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

    precomputeCounts(_context = {}) {
        // Optional hook point for plugin-specific one-time async precompute.
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
                const maxRetries = 20;
                const retryDelayMs = 100;
                let retries = 0;

                const tryEnable = () => {
                    const result = this.enablePluginTranslation();
                    if (result !== false) {
                        console.log(
                            `[PluginTranslator] Plugin translation mounted for ${this.getPluginName()} after ${retries} retries.`
                        );
                        return;
                    }

                    if (retries >= maxRetries) {
                        console.info(
                            `[PluginTranslator] Plugin translation never mounted for ${this.getPluginName()} after ${maxRetries} retries.`
                        );
                        Alert.infoHtml(
                            `Plugin ${this.getPluginLabel()} failed to initialize.`,
                            null,
                            5000
                        );
                        return;
                    }

                    retries += 1;
                    setTimeout(tryEnable, retryDelayMs);
                };

                tryEnable();
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
            this.getCachedCountsSync(context) || {
                total: 0,
                left: 0,
                totalStrings: 0,
                leftStrings: 0,
            }
        );
    }

    getCachedCountsSync(_context = {}) {
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

    /**
     * Resolve translated text from runtime cache.
     * @param {*} text - Source text
     * @param {object|null} runtime - Translation runtime
     * @param {string|string[]} cacheType - Cache type or ordered cache type list
     * @param {object} options - Optional resolver options
     * @param {boolean} [options.requireRuntimeTranslationActive=false] - Require runtime translation active state
     * @param {*} [options.missValue] - Value returned on cache miss/runtime unavailable (defaults to source text)
     * @returns {*} Resolved translated text or fallback
     */
    resolveRuntimeTranslation(
        text,
        runtime = this.getRuntime(),
        cacheType = this.getCacheType(),
        options = {}
    ) {
        const missValue = Object.prototype.hasOwnProperty.call(options, 'missValue')
            ? options.missValue
            : text;

        if (!this.isUsableText(text) || !runtime) {
            return missValue;
        }

        if (options.requireRuntimeTranslationActive && !this.isRuntimeTranslationActive(runtime)) {
            return missValue;
        }

        const cacheTypes = Array.isArray(cacheType) ? cacheType : [cacheType];
        for (const currentCacheType of cacheTypes) {
            if (!this.isUsableText(currentCacheType)) {
                continue;
            }

            const cacheKey = runtime.getCacheKey(text, currentCacheType);
            runtime.trackCacheKeyUsage(cacheKey);

            if (!runtime.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            const cached = runtime.translationCache.get(cacheKey);
            if (this.isUsableText(cached)) {
                return cached;
            }
        }

        return missValue;
    }

    isRuntimeTranslationActive(runtime = this.getRuntime()) {
        if (!runtime) {
            return false;
        }

        const translationEnabled = !!(runtime.isTranslationEnabled() || runtime.enabled);
        return translationEnabled || !!runtime.translateCacheWhenDisabled;
    }
}
