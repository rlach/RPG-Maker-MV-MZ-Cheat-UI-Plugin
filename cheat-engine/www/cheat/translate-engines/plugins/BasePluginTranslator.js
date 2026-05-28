import { BasePhase } from '../translation-phases/BasePhase.js';
import { shouldApplyHook } from '../../js/HookGuardHelper.js';
import { Alert } from '../../js/AlertHelper.js';
import { normalizeText } from './translators/TranslatorHelpers.js';

export class BasePluginTranslator extends BasePhase {
    // Override this if your plugin can't be enabled too early or has race condition if enabled before certain game code is loaded.
    initialDelayBeforeEnablePluginTranslationMs = 0;

    constructor() {
        super();
        this._pluginDetected = false;
        this._detectionChecked = false;
        this._enableAttemptCount = 0;
        this._enableRetryCount = 0;
        this._enableSucceeded = false;
        this._enableFinalized = false;
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

    getPluginAliases() {
        return [this.getPluginName()];
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
        if (!Array.isArray(window.$plugins)) {
            return false;
        }

        const pluginNames = this.getPluginAliases()
            .map((name) =>
                String(name || '')
                    .trim()
                    .toLowerCase()
            )
            .filter(Boolean);

        if (pluginNames.length <= 0) {
            return false;
        }

        return window.$plugins.some((plugin) => {
            if (!plugin || typeof plugin.name !== 'string' || plugin.status !== true) {
                return false;
            }

            return pluginNames.includes(plugin.name.trim().toLowerCase());
        });
    }

    findPluginEntry(pluginName) {
        if (!Array.isArray(window.$plugins)) {
            return null;
        }

        const needle = normalizeText(pluginName).trim().toLowerCase();
        if (!needle) {
            return null;
        }

        return (
            window.$plugins.find((plugin) => {
                const name = normalizeText(plugin?.name).toLowerCase();
                return !!name && name === needle;
            }) || null
        );
    }

    enablePluginTranslation() {
        // Optional hook point for plugin-specific runtime integration.
        // Return false if integration is not yet ready and should be retried after a delay.
        // Never fail silently, either throw or return false to trigger retry, to ensure issues are visible in logs.
        return true;
    }

    getEnablePluginTranslationStatus() {
        return {
            enabled: !!this._enableSucceeded,
            finalized: !!this._enableFinalized,
            attempts: Math.max(0, Number(this._enableAttemptCount) || 0),
            retries: Math.max(0, Number(this._enableRetryCount) || 0),
        };
    }

    _markEnableSucceeded() {
        this._enableSucceeded = true;
        this._enableFinalized = true;
    }

    _scheduleEnablePluginTranslation() {
        if (this._enableFinalized) {
            return;
        }

        try {
            // Use hook guard to prevent re-initialization if this translator runs in separate window.
            // If another window already mounted the translator hook, treat this translator as active.
            if (!shouldApplyHook(this._getPluginHookName())) {
                this._markEnableSucceeded();
                return;
            }

            const maxRetries = 20;
            const retryDelayMs = 100;

            const tryEnable = () => {
                this._enableAttemptCount += 1;

                const result = this.enablePluginTranslation();
                if (result !== false) {
                    this._markEnableSucceeded();
                    return;
                }

                if (this._enableRetryCount >= maxRetries) {
                    this._enableFinalized = true;
                    Alert.html(
                        `Plugin ${this.getPluginLabel()} failed to initialize.`,
                        null,
                        5000,
                        'warn'
                    );
                    return;
                }

                this._enableRetryCount += 1;
                setTimeout(tryEnable, retryDelayMs);
            };

            setTimeout(tryEnable, this.initialDelayBeforeEnablePluginTranslationMs);
        } catch (error) {
            this._enableFinalized = true;
            console.warn(
                `[PluginTranslator] Failed to enable plugin translation for ${this.getPluginName()}`,
                error
            );
        }
    }

    markDetectedFromPluginManifest() {
        if (this._pluginDetected && this._detectionChecked) {
            return;
        }

        this._pluginDetected = true;
        this._detectionChecked = true;
        this._scheduleEnablePluginTranslation();
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
     * Optional hook point for extending shared event-command traversal.
     * Return an object with collectEntriesAt(context) and optional createState(context).
     *
     * collectEntriesAt return contract:
     * - null/undefined: no handling, shared traversal continues normally.
     * - { handled: true, nextIndex?: number }: traversal handled at current index.
     *
     * @returns {object|null}
     */
    getEventCommandTraversalExtension(_context = {}) {
        return null;
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
            this._scheduleEnablePluginTranslation();
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
     * @param {boolean} [options.harvestMissing=true] - Whether to track cache key usage for missing translations
     * @returns {*} Resolved translated text or fallback
     */
    resolveRuntimeTranslation(
        text,
        runtime = this.getRuntime(),
        cacheType = this.getCacheType(),
        options = {}
    ) {
        const missValue = Object.getOwnPropertyDescriptor(options, 'missValue')
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
            runtime.trackCacheKeyUsage(cacheKey, {
                harvestMissing: options.harvestMissing ?? true,
            });

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
        return translationEnabled || !!runtime.enableTranslation;
    }
}
