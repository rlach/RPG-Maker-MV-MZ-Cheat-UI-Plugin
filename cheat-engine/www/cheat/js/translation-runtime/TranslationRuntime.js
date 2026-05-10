import { KeyValueStorage } from '../KeyValueStorage.js';
import { createSecureSecretStorage } from '../SecureSecretStorage.js';
import { ensureSettingsMigration } from '../UnifiedSettings.js';
import { TranslateOnTheFlyState } from '../TranslateOnTheFlyState.js';
import { ensureTranslateCacheRuntime } from '../TranslateCacheRuntime.js';
import { createEngine, getAvailableEngines } from '../../translate-engines/index.js';
import { createTranslationBatchManager } from '../../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import { translateOnTheFlySettingsMethods } from './TranslateOnTheFlySettingsMethods.js';
import { translateOnTheFlyCacheMethods } from './TranslateOnTheFlyCacheMethods.js';
import { translateOnTheFlyUiMethods } from './TranslateOnTheFlyUiMethods.js';
import { translateOnTheFlyMessageMethods } from './TranslateOnTheFlyMessageMethods.js';
import { translateOnTheFlyFlowMethods } from './TranslateOnTheFlyFlowMethods.js';
import { translateOnTheFlyRuntimeMethods } from './TranslateOnTheFlyRuntimeMethods.js';
import { objectTranslationRuntimeMethods } from './ObjectTranslationModalMethods.js';
import { translateOnTheFlyCoreMethods } from './TranslateOnTheFlyCoreMethods.js';
import { ensureKnowledgeForLangPair } from '../KnowledgeBaseRuntime.js';
import {
    createTranslationRuntimeStateDefaults,
    UI_SYNC_STATE_KEYS,
    UI_SYNC_TO_ONLY_STATE_KEYS,
} from './TranslationRuntimeDefaults.js';

function getHostWindow() {
    if (window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed) {
        return window.opener;
    }

    return window;
}

class TranslationRuntime {
    constructor() {
        const engineOptions = getAvailableEngines();

        this.$set = (target, key, value) => {
            target[key] = value;
        };

        this._initialized = false;
        this._hookInitialized = false;

        /** @type {Array<(level: string, msg: string) => void>} */
        this._notifyListeners = [];

        /** @type {() => boolean} */
        this._isMessageSkipActive = () => false;

        Object.assign(this, createTranslationRuntimeStateDefaults(engineOptions));
    }

    initialize() {
        if (this._initialized) {
            return this;
        }

        ensureSettingsMigration();

        this.kvStorage = new KeyValueStorage('./www/cheat-settings/translate-on-the-fly.json');
        this.secureSecretStorage = createSecureSecretStorage();
        this.cacheStorage = new KeyValueStorage('./www/cheat-settings/translate-cache.json');
        const runtime = ensureTranslateCacheRuntime();
        this.translationCache = runtime.cache;
        this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
        this.pendingTranslations = new Map();
        this.failedTranslations = new Map();
        this.translationInProgress = false;
        this._foregroundDialogBatchState = {
            active: false,
            operationKey: '',
            sourceTrigger: '',
            startedAt: 0,
            promise: null,
        };
        this._foregroundBatchWatchdogMs = 60000;
        this._foregroundPreemptedOperationKey = '';

        this.loadSettings();
        this.loadCacheFromDisk();
        this.engine = createEngine(this.translationEngine, this);
        this.batchManager = createTranslationBatchManager(this);

        if (this.engineSettings && this.engineSettings[this.translationEngine]) {
            const engineConfig = this.engineSettings[this.translationEngine];
            Object.assign(this.engine, engineConfig);
            if (typeof this.engine.setCustomTags === 'function') {
                this.engine.setCustomTags(this.engine.customTags || []);
            }
        }

        this.bindEngineConfigTo(this);
        this.loadAiApiKeyFromSecureStore().catch((error) => {
            console.warn(
                '[TranslateOnTheFly] Failed to load AI API key from secure storage:',
                error
            );
        });
        this.deferHookInitialization();

        this.stateUnsubscribe = TranslateOnTheFlyState.subscribe((enabled) => {
            this.enabled = enabled;
            if (enabled) {
                this.ensureHookInitialized('state-enabled');
            }
        });

        this._initialized = true;
        this.installWindowAliases();

        // Initialize knowledge base for current language pair
        if (this.sourceLang && this.targetLang) {
            ensureKnowledgeForLangPair(this.sourceLang, this.targetLang);
        }

        if (this.translateCacheWhenDisabled) {
            console.log('[TranslateOnTheFly] Applying cached translations to data objects');
            this.applyCachedTranslationsToData();
        }

        return this;
    }

    installWindowAliases() {
        const host = getHostWindow();
        host.__TranslationRuntime = this;
        host.__TranslateRuntime = this;
        host.__ensureTranslationRuntime = ensureTranslationRuntime;
        host.__ensureTranslateOnTheFlyRuntime = ensureTranslationRuntime;

        if (host !== window) {
            window.__TranslationRuntime = this;
            window.__TranslateRuntime = this;
            window.__ensureTranslationRuntime = ensureTranslationRuntime;
            window.__ensureTranslateOnTheFlyRuntime = ensureTranslationRuntime;
        }
    }

    /**
     * Emit a notification to all subscribed listeners (UI adapters).
     * @param {'success'|'info'|'warn'|'error'} level
     * @param {string} msg
     */
    notify(level, msg) {
        for (const listener of this._notifyListeners) {
            listener(level, msg);
        }
    }

    /**
     * Subscribe a listener for runtime notifications.
     * @param {(level: string, msg: string) => void} listener
     * @returns {() => void} unsubscribe function
     */
    onNotify(listener) {
        this._notifyListeners.push(listener);
        return () => this.offNotify(listener);
    }

    /**
     * Remove a notification listener.
     * @param {(level: string, msg: string) => void} listener
     */
    offNotify(listener) {
        const idx = this._notifyListeners.indexOf(listener);
        if (idx !== -1) {
            this._notifyListeners.splice(idx, 1);
        }
    }

    /**
     * Set the provider for message-skip state (replaces direct MessageCheat dependency).
     * @param {() => boolean} provider
     */
    setMessageSkipProvider(provider) {
        this._isMessageSkipActive = provider;
    }

    deferHookInitialization() {
        if (this._hookInitialized) {
            return;
        }

        if (!this.shouldInitializeHooks()) {
            return;
        }

        this.ensureHookInitialized('deferred');
    }

    shouldInitializeHooks() {
        return (
            this.isTranslationEnabled() ||
            !!this.translateCacheWhenDisabled ||
            this.isNonOtfTranslationProcessActive()
        );
    }

    ensureHookInitialized(reason = 'manual') {
        if (this._hookInitialized) {
            return;
        }

        try {
            this.setupTranslationHook();
            this._hookInitialized = true;
            console.log(`[TranslateOnTheFly] Hook initialized (${reason})`);
            return;
        } catch (error) {
            console.warn('[TranslateOnTheFly] Hook init failed, retrying delayed', error);
        }

        setTimeout(() => {
            if (this._hookInitialized) {
                return;
            }

            if (!this.shouldInitializeHooks()) {
                return;
            }

            this.setupTranslationHook();
            this._hookInitialized = true;
            console.log(`[TranslateOnTheFly] Hook initialized (delayed:${reason})`);
        }, 1000);
    }

    bindEngineConfigTo(target) {
        if (!target || !this.engine) {
            return;
        }

        const setter =
            typeof target.$set === 'function'
                ? (key, value) => target.$set(target, key, value)
                : (key, value) => {
                      target[key] = value;
                  };

        const engineConfigData = this.engine.getConfigData();
        Object.keys(engineConfigData).forEach((key) => {
            setter(key, engineConfigData[key]);
        });

        const engineConfigMethods = this.engine.getConfigMethods();
        Object.keys(engineConfigMethods).forEach((methodName) => {
            target[methodName] = engineConfigMethods[methodName].bind(target);
        });
    }

    syncUiStateTo(target) {
        if (!target) {
            return;
        }

        const setter =
            typeof target.$set === 'function'
                ? (key, value) => target.$set(target, key, value)
                : (key, value) => {
                      target[key] = value;
                  };

        const snapshotKeys = [...UI_SYNC_STATE_KEYS, ...UI_SYNC_TO_ONLY_STATE_KEYS];

        snapshotKeys.forEach((key) => {
            setter(key, this[key]);
        });

        this.bindEngineConfigTo(target);
    }

    syncUiStateFrom(target) {
        if (!target) {
            return;
        }

        const snapshotKeys = UI_SYNC_STATE_KEYS;

        snapshotKeys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(target, key)) {
                this[key] = target[key];
            }
        });
    }
}

Object.assign(
    TranslationRuntime.prototype,
    translateOnTheFlySettingsMethods,
    translateOnTheFlyCacheMethods,
    translateOnTheFlyUiMethods,
    translateOnTheFlyMessageMethods,
    translateOnTheFlyFlowMethods,
    translateOnTheFlyRuntimeMethods,
    objectTranslationRuntimeMethods,
    translateOnTheFlyCoreMethods
);

const LOCAL_TRANSLATION_RUNTIME = new TranslationRuntime();

export function getTranslationRuntime() {
    const host = getHostWindow();
    return host.__TranslationRuntime || host.__TranslateRuntime || LOCAL_TRANSLATION_RUNTIME;
}

export function ensureTranslationRuntime() {
    if (window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed) {
        const existingRootRuntime =
            window.opener.__TranslationRuntime || window.opener.__TranslateRuntime;

        if (existingRootRuntime) {
            window.__TranslationRuntime = existingRootRuntime;
            window.__TranslateRuntime = existingRootRuntime;
            window.__ensureTranslationRuntime = ensureTranslationRuntime;
            window.__ensureTranslateOnTheFlyRuntime = ensureTranslationRuntime;
            return existingRootRuntime.initialize
                ? existingRootRuntime.initialize()
                : existingRootRuntime;
        }

        const ensureOnRoot =
            window.opener.__ensureTranslationRuntime ||
            window.opener.__ensureTranslateOnTheFlyRuntime;

        if (typeof ensureOnRoot === 'function' && ensureOnRoot !== ensureTranslationRuntime) {
            const rootRuntime = ensureOnRoot();
            if (rootRuntime) {
                window.__TranslationRuntime = rootRuntime;
                window.__TranslateRuntime = rootRuntime;
                window.__ensureTranslationRuntime = ensureTranslationRuntime;
                window.__ensureTranslateOnTheFlyRuntime = ensureTranslationRuntime;
                return rootRuntime;
            }
        }

        // Never bootstrap a local runtime from external window when root runtime is not ready yet.
        // Local-first bootstrap can clear shared cache state for the whole session.
        return LOCAL_TRANSLATION_RUNTIME;
    }

    const runtime = getTranslationRuntime();
    return runtime.initialize ? runtime.initialize() : runtime;
}

export { LOCAL_TRANSLATION_RUNTIME, TranslationRuntime };
