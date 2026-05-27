import { TranslateOnTheFlyState } from '../TranslateOnTheFlyState.js';
import { ensureTranslateCacheRuntime } from '../TranslateCacheRuntime.js';
import {
    getMessageSourceTextVariants as getMessageSourceTextVariantsHelper,
    buildMessageCacheLookupKeys,
} from '../MessageCacheKeyHelper.js';
import { createTranslationBatchManager } from '../../translate-engines/batch-manager/TranslationBatchManagerFactory.js';
import { DATA_CONTAINER_TRANSLATION_DEFINITIONS } from '../../translate-engines/translation-phases/DataContainerDefinitions.js';
import { runCacheMigrationsIfNeeded } from './TranslateCacheMigrations.js';

export const translateOnTheFlyCoreMethods = {
    isBatchQueueAbortRequested() {
        return !!this._batchQueueAbortRequested;
    },

    clearBatchQueueAbortRequest() {
        this._batchQueueAbortRequested = false;
    },

    requestBatchQueueAbort() {
        if (!this.isNonOtfTranslationProcessActive()) {
            return false;
        }

        this._batchQueueAbortRequested = true;
        const cancelled =
            this.engine?.cancelActiveRequest?.('request_aborted') ||
            this.engine?.cancelActiveBackgroundRequest?.() ||
            false;

        console.log(
            `[TranslateOnTheFly] Queue abort requested by user (${cancelled ? 'active request cancelled' : 'no active request'})`
        );
        return true;
    },

    isTranslationEnabled() {
        const stateEnabled = TranslateOnTheFlyState.isEnabled();
        const localEnabled = this.enabled;
        const enabled = stateEnabled || localEnabled;
        if (enabled && !this._loggedEnabledOnce) {
            console.log(
                '[TranslateOnTheFly] isTranslationEnabled true (state/local):',
                stateEnabled,
                localEnabled
            );
            this._loggedEnabledOnce = true;
        }
        return enabled;
    },

    isSkippingMessages() {
        return this._isMessageSkipActive();
    },

    isNonOtfTranslationProcessActive() {
        return !!(this.nonOtfTranslationProcess && this.nonOtfTranslationProcess.active);
    },

    getActiveNonOtfTranslationProcessLabel() {
        if (!this.isNonOtfTranslationProcessActive()) {
            return '';
        }

        return this.nonOtfTranslationProcess.label || 'translation';
    },

    beginNonOtfTranslationProcess(label = 'translation') {
        if (this.isNonOtfTranslationProcessActive()) {
            const activeLabel = this.getActiveNonOtfTranslationProcessLabel();
            this.notify(
                'warn',
                `Another translation is already in progress (${activeLabel}). Only On-The-Fly translation can run in parallel.`
            );
            return false;
        }

        this.nonOtfTranslationProcess = {
            active: true,
            label,
            startedAt: Date.now(),
        };
        this.ensureHookInitialized('non-otf-process');
        this.clearBatchQueueAbortRequest();
        return true;
    },

    endNonOtfTranslationProcess() {
        this.clearBatchQueueAbortRequest();
        this.nonOtfTranslationProcess = {
            active: false,
            label: '',
            startedAt: 0,
        };
    },

    applyExternalToggle(enabled, notify = false) {
        TranslateOnTheFlyState.setEnabled(enabled);
        this.enabled = enabled;
        if (enabled) {
            this.ensureHookInitialized('external-toggle');
        }
        this.saveSettings();
        this.notifyCacheRuntime('settings-enabled');

        if (notify) {
            this.notify('success', `Real-time translation: ${enabled ? 'enabled' : 'disabled'}`);
        }
    },

    toggleEnabledExternal(notify = true) {
        const enabled = TranslateOnTheFlyState.toggleEnabled();
        this.applyExternalToggle(enabled, notify);
        return enabled;
    },

    getCacheKey(text, type) {
        if (typeof type !== 'string' || !type.trim()) {
            throw new Error('[TranslateOnTheFly] getCacheKey requires an explicit cache type');
        }

        const cacheType = type === 'speaker' ? 'actor_name' : type;
        const normalizedText = typeof text === 'string' ? text.replace(/\n+$/, '') : text;
        return `${cacheType}:${this.sourceLang}-${this.targetLang}-${normalizedText}`;
    },

    isMessageCacheType(type) {
        return type === 'message' || type === 'message_portrait';
    },

    getCurrentMessageFaceName(gameMessage = null) {
        const currentGameMessage = gameMessage || window.$gameMessage;
        if (!currentGameMessage) {
            return '';
        }

        if (typeof currentGameMessage.faceName === 'function') {
            try {
                const faceName = currentGameMessage.faceName();
                if (typeof faceName === 'string') {
                    return faceName;
                }

                if (faceName !== null && faceName !== undefined) {
                    return String(faceName);
                }

                return '';
            } catch (error) {
                console.warn('[TranslateOnTheFly] Failed to read message faceName()', error);
            }
        }

        if (typeof currentGameMessage._faceName === 'string') {
            return currentGameMessage._faceName;
        }

        return '';
    },

    hasCurrentMessagePortrait(gameMessage = null) {
        return this.getCurrentMessageFaceName(gameMessage).trim().length > 0;
    },

    getMessageCacheType(options = {}) {
        return options?.hasPortrait ? 'message_portrait' : 'message';
    },

    getMessageSourceTextVariants(text) {
        return getMessageSourceTextVariantsHelper(text);
    },

    getMessageCacheKey(text, options = {}) {
        const [primaryText] = this.getMessageSourceTextVariants(text);
        return this.getCacheKey(primaryText, this.getMessageCacheType(options));
    },

    getMessageCacheLookupKeys(text, options = {}) {
        return buildMessageCacheLookupKeys(
            this.getCacheKey.bind(this),
            text,
            !!options?.hasPortrait
        );
    },

    getPreferredMessageCacheEntry(text, options = {}) {
        if (typeof text !== 'string' || !text.trim()) {
            return null;
        }

        const lookupKeys = this.getMessageCacheLookupKeys(text, options);
        for (const cacheKey of lookupKeys) {
            this.trackCacheKeyUsage(cacheKey, { harvestMissing: false });

            if (!this.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            return {
                cacheKey,
                value: this.translationCache.get(cacheKey),
            };
        }

        return null;
    },

    normalizeCommandLookupText(commandName) {
        if (typeof commandName === 'string') {
            return commandName;
        }

        if (commandName === null || commandName === undefined) {
            return '';
        }

        return String(commandName);
    },

    buildReverseCommandLookupFromCache() {
        if (!(this.reverseCommandLookup instanceof Map)) {
            this.reverseCommandLookup = new Map();
        }

        if (!(this.translationCache instanceof Map)) {
            return;
        }

        for (const [cacheKey, translatedValue] of this.translationCache.entries()) {
            if (typeof cacheKey !== 'string' || !cacheKey.startsWith('command:')) {
                continue;
            }

            const normalizedTranslatedValue =
                typeof translatedValue === 'string' ? translatedValue.trim() : '';
            if (!normalizedTranslatedValue) {
                continue;
            }

            this.reverseCommandLookup.set(normalizedTranslatedValue, cacheKey);
        }
    },

    resolveCanonicalCommandNameFromCacheKey(commandCacheKey, fallbackName) {
        if (typeof commandCacheKey !== 'string' || !commandCacheKey) {
            return fallbackName;
        }

        const parsed = this.parseCompositeCacheKey(commandCacheKey);
        if (!parsed || parsed.type !== 'command' || typeof parsed.textKey !== 'string') {
            return fallbackName;
        }

        const canonicalName = parsed.textKey.trim();
        return canonicalName || fallbackName;
    },

    getCanonicalSystemCommandName(commandName) {
        const normalizedName = this.normalizeCommandLookupText(commandName);

        if (!normalizedName) {
            return normalizedName;
        }

        if (!(this.reverseCommandLookup instanceof Map)) {
            this.reverseCommandLookup = new Map();
        }

        if (this.reverseCommandLookup.size === 0 && this.translationCache instanceof Map) {
            this.buildReverseCommandLookupFromCache();
        }

        const commandCacheKey = this.reverseCommandLookup.get(normalizedName);
        return this.resolveCanonicalCommandNameFromCacheKey(commandCacheKey, normalizedName);
    },

    removeReverseCommandLookupByCacheKey(cacheKey) {
        if (!(this.reverseCommandLookup instanceof Map) || !cacheKey) {
            return;
        }

        for (const [lookupText, mappedCacheKey] of this.reverseCommandLookup.entries()) {
            if (mappedCacheKey === cacheKey) {
                this.reverseCommandLookup.delete(lookupText);
            }
        }
    },

    updateReverseCommandLookup(cacheKey, normalizedValue) {
        if (typeof cacheKey !== 'string' || !cacheKey.startsWith('command:')) {
            return;
        }

        if (!(this.reverseCommandLookup instanceof Map)) {
            this.reverseCommandLookup = new Map();
        }

        this.removeReverseCommandLookupByCacheKey(cacheKey);

        const normalizedLookupKey = typeof normalizedValue === 'string' ? normalizedValue : '';
        if (!normalizedLookupKey) {
            return;
        }

        this.reverseCommandLookup.set(normalizedLookupKey, cacheKey);
    },

    resolveCommandCacheWriteKey(cacheKey) {
        if (typeof cacheKey !== 'string' || !cacheKey.startsWith('command:')) {
            return cacheKey;
        }

        const parsed = this.parseCompositeCacheKey(cacheKey);
        const sourceCommandName =
            parsed?.type === 'command' ? this.normalizeCommandLookupText(parsed.textKey) : '';
        if (!sourceCommandName) {
            return cacheKey;
        }

        const canonicalName = this.getCanonicalSystemCommandName(sourceCommandName);
        if (!canonicalName || canonicalName === sourceCommandName) {
            return cacheKey;
        }

        return this.getCacheKey(canonicalName, 'command');
    },

    setCacheValue(key, value, options = {}) {
        const normalizedValue = this.normalizeCacheValue(value);
        const resolvedKey = this.resolveCommandCacheWriteKey(key);
        const changedKeys = new Set();

        // Guard against duplicate command keys (e.g. translated-name harvest keys).
        if (resolvedKey !== key && this.translationCache.has(key)) {
            this.translationCache.delete(key);
            this.removeReverseCommandLookupByCacheKey(key);
            changedKeys.add(key);
        }

        const currentValue = this.translationCache.get(resolvedKey);
        const hasExistingTranslatedValue = this.isTranslatedCacheValue(currentValue);
        const incomingIsPlaceholder = normalizedValue === '';

        // Never downgrade an existing translated command value with a harvested placeholder.
        if (!(incomingIsPlaceholder && hasExistingTranslatedValue)) {
            this.translationCache.set(resolvedKey, normalizedValue);
            changedKeys.add(resolvedKey);
        }

        this.updateReverseCommandLookup(resolvedKey, this.translationCache.get(resolvedKey));
        this.rememberCacheBucketForKey(resolvedKey);

        const persist = options.persist === undefined ? true : !!options.persist;
        if (persist) {
            const changedKeyList = Array.from(changedKeys);
            if (changedKeyList.length > 0) {
                this.persistCache(changedKeyList);
            }
        }

        this.notifyCacheRuntime('cache-set', resolvedKey);
    },

    getCacheFileSystem() {
        return (this.cacheStorage && this.cacheStorage.fileSystem) || require('fs');
    },

    getSplitCacheDirectoryPath() {
        const path = require('path');
        const cacheFilePath =
            (this.cacheStorage && this.cacheStorage.filePath) ||
            './www/cheat-settings/translate-cache.json';
        const parsed = path.parse(cacheFilePath);
        return path.join(parsed.dir, 'translate-cache');
    },

    getVariableTranslationSettingsFilePath() {
        const path = require('path');
        return path.join(this.getSplitCacheDirectoryPath(), 'variable-translation-settings.json');
    },

    ensureSplitCacheDirectorySync() {
        const fs = this.getCacheFileSystem();
        const directoryPath = this.getSplitCacheDirectoryPath();
        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath, { recursive: true });
        }
    },

    parseCompositeCacheKey(cacheKey) {
        if (typeof cacheKey !== 'string' || cacheKey.length === 0) {
            return null;
        }

        const colonIndex = cacheKey.indexOf(':');
        if (colonIndex <= 0) {
            return null;
        }

        const type = cacheKey.slice(0, colonIndex);
        const payload = cacheKey.slice(colonIndex + 1);
        if (!type || !payload) {
            return null;
        }

        const currentLangPair = `${this.sourceLang}-${this.targetLang}`;
        const currentPrefix = `${currentLangPair}-`;
        if (payload.startsWith(currentPrefix)) {
            const textKey = payload.slice(currentPrefix.length);
            if (!textKey) {
                return null;
            }

            return {
                type,
                langPair: currentLangPair,
                textKey,
            };
        }

        const firstDash = payload.indexOf('-');
        if (firstDash <= 0) {
            return null;
        }

        const secondDash = payload.indexOf('-', firstDash + 1);
        if (secondDash <= firstDash + 1) {
            return null;
        }

        const sourceLang = payload.slice(0, firstDash);
        const targetLang = payload.slice(firstDash + 1, secondDash);
        const textKey = payload.slice(secondDash + 1);
        if (!sourceLang || !targetLang || !textKey) {
            return null;
        }

        return {
            type,
            langPair: `${sourceLang}-${targetLang}`,
            textKey,
        };
    },

    normalizeCacheValue(value) {
        return typeof value === 'string'
            ? value
            : value === null || value === undefined
              ? ''
              : String(value);
    },

    getCacheBucketId(type, langPair) {
        if (!type || !langPair) {
            return null;
        }

        return `${type}::${langPair}`;
    },

    parseCacheBucketId(bucketId) {
        if (typeof bucketId !== 'string') {
            return null;
        }

        const separatorIndex = bucketId.indexOf('::');
        if (separatorIndex <= 0) {
            return null;
        }

        const type = bucketId.slice(0, separatorIndex);
        const langPair = bucketId.slice(separatorIndex + 2);
        if (!type || !langPair) {
            return null;
        }

        return { type, langPair };
    },

    getSplitCacheFileNameFromBucketId(bucketId) {
        const parsed = this.parseCacheBucketId(bucketId);
        if (!parsed) {
            return null;
        }

        return `${parsed.type}.${parsed.langPair}.cache.json`;
    },

    getSplitCacheFilePathFromBucketId(bucketId) {
        const path = require('path');
        const fileName = this.getSplitCacheFileNameFromBucketId(bucketId);
        if (!fileName) {
            return null;
        }

        return path.join(this.getSplitCacheDirectoryPath(), fileName);
    },

    parseSplitCacheFileName(fileName) {
        if (typeof fileName !== 'string') {
            return null;
        }

        const matched = fileName.match(/^(.*)\.([^.]+)\.cache\.json$/);
        if (!matched) {
            return null;
        }

        const type = matched[1];
        const langPair = matched[2];
        if (!type || !langPair) {
            return null;
        }

        return {
            type,
            langPair,
            bucketId: this.getCacheBucketId(type, langPair),
        };
    },

    getAllSplitCacheBucketsFromDiskSync() {
        const fs = this.getCacheFileSystem();
        const directoryPath = this.getSplitCacheDirectoryPath();
        if (!fs.existsSync(directoryPath)) {
            return [];
        }

        try {
            const names = fs.readdirSync(directoryPath);
            const buckets = [];

            for (const name of names) {
                const parsed = this.parseSplitCacheFileName(name);
                if (parsed && parsed.bucketId) {
                    buckets.push(parsed.bucketId);
                }
            }

            return buckets;
        } catch (error) {
            console.warn('[TranslateOnTheFly] Failed to list split cache files', error);
            return [];
        }
    },

    readJsonFileSync(filePath) {
        const fs = this.getCacheFileSystem();
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    },

    writeJsonFileAtomicSync(filePath, payload) {
        const fs = this.getCacheFileSystem();
        const data = payload && typeof payload === 'object' ? payload : {};
        fs.writeFileSync(`${filePath}.tmp`, this.formatSplitCacheJson(data), 'utf-8');
        fs.renameSync(`${filePath}.tmp`, filePath);
    },

    async writeJsonFileAtomicAsync(filePath, payload) {
        const fs = this.getCacheFileSystem();
        const data = payload && typeof payload === 'object' ? payload : {};
        await fs.promises.writeFile(`${filePath}.tmp`, this.formatSplitCacheJson(data), 'utf-8');
        await fs.promises.rename(`${filePath}.tmp`, filePath);
    },

    formatSplitCacheJson(data) {
        const sorted = {};
        for (const key of Object.keys(data || {}).sort()) {
            sorted[key] = data[key];
        }

        return `${JSON.stringify(sorted, null, 2)}\n`;
    },

    normalizeSafeVariableTranslationIds(ids) {
        const safeIds = Array.isArray(ids) ? ids : [];
        return Array.from(
            new Set(safeIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))
        ).sort((a, b) => a - b);
    },

    loadVariableTranslationSettingsFromDisk() {
        const fs = this.getCacheFileSystem();
        const filePath = this.getVariableTranslationSettingsFilePath();
        this.safeVariableTranslationIds = [];
        this.safeVariableTranslationIdSet = new Set();

        if (!fs.existsSync(filePath)) {
            return;
        }

        try {
            const payload = this.readJsonFileSync(filePath);
            const safeIds = this.normalizeSafeVariableTranslationIds(
                payload && payload.safeVariableIds
            );
            this.safeVariableTranslationIds = safeIds;
            this.safeVariableTranslationIdSet = new Set(safeIds);
        } catch (error) {
            console.warn('[TranslateOnTheFly] Failed to load variable translation settings', error);
        }
    },

    persistVariableTranslationSettings() {
        this.ensureSplitCacheDirectorySync();
        this.writeJsonFileAtomicSync(this.getVariableTranslationSettingsFilePath(), {
            safeVariableIds: this.getSafeVariableTranslationIds(),
        });
    },

    getSafeVariableTranslationIds() {
        if (!Array.isArray(this.safeVariableTranslationIds)) {
            this.safeVariableTranslationIds = this.normalizeSafeVariableTranslationIds(
                this.safeVariableTranslationIds
            );
        }

        if (!(this.safeVariableTranslationIdSet instanceof Set)) {
            this.safeVariableTranslationIdSet = new Set(this.safeVariableTranslationIds);
        }

        return this.safeVariableTranslationIds.slice();
    },

    isVariableSafeForTranslation(variableId) {
        const safeId = Number(variableId) || 0;
        if (safeId <= 0) {
            return false;
        }

        this.getSafeVariableTranslationIds();
        return this.safeVariableTranslationIdSet.has(safeId);
    },

    setVariableSafeForTranslation(variableId, enabled, options = {}) {
        const safeId = Number(variableId) || 0;
        if (safeId <= 0) {
            return this.getSafeVariableTranslationIds();
        }

        const nextSet = new Set(this.getSafeVariableTranslationIds());
        if (enabled) {
            nextSet.add(safeId);
        } else {
            nextSet.delete(safeId);
        }

        const nextIds = this.normalizeSafeVariableTranslationIds(Array.from(nextSet));
        this.safeVariableTranslationIds = nextIds;
        this.safeVariableTranslationIdSet = new Set(nextIds);

        if (!options || options.persist !== false) {
            this.persistVariableTranslationSettings();
        }

        return nextIds.slice();
    },

    getRawGameVariableValue(variableId) {
        const safeId = Number(variableId) || 0;
        if (safeId < 0 || !window.$gameVariables || !Array.isArray($gameVariables._data)) {
            return 0;
        }

        return $gameVariables._data[safeId] ?? 0;
    },

    rememberCacheBucketForKey(cacheKey, explicitBucketId = null) {
        if (!this.cacheBucketByCompositeKey) {
            this.cacheBucketByCompositeKey = new Map();
        }

        let bucketId = explicitBucketId;
        if (!bucketId) {
            const parsedKey = this.parseCompositeCacheKey(cacheKey);
            bucketId = parsedKey ? this.getCacheBucketId(parsedKey.type, parsedKey.langPair) : null;
        }

        if (bucketId) {
            this.cacheBucketByCompositeKey.set(cacheKey, bucketId);
        }

        return bucketId;
    },

    getBucketForCacheKey(cacheKey) {
        if (this.cacheBucketByCompositeKey?.has(cacheKey)) {
            return this.cacheBucketByCompositeKey.get(cacheKey);
        }

        return this.rememberCacheBucketForKey(cacheKey);
    },

    loadSplitCacheFromDisk() {
        const fs = this.getCacheFileSystem();
        const path = require('path');
        const directoryPath = this.getSplitCacheDirectoryPath();
        if (!fs.existsSync(directoryPath)) {
            return;
        }

        const files = fs.readdirSync(directoryPath);
        for (const fileName of files) {
            const parsed = this.parseSplitCacheFileName(fileName);
            if (!parsed || !parsed.bucketId) {
                continue;
            }

            const filePath = path.join(directoryPath, fileName);
            let payload;
            try {
                payload = this.readJsonFileSync(filePath);
            } catch (error) {
                console.warn(
                    `[TranslateOnTheFly] Failed to read split cache file ${fileName}`,
                    error
                );
                continue;
            }

            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                continue;
            }

            for (const [textKey, value] of Object.entries(payload)) {
                const compositeKey = `${parsed.type}:${parsed.langPair}-${textKey}`;
                const normalizedValue = this.normalizeCacheValue(value);
                this.translationCache.set(compositeKey, normalizedValue);
                this.rememberCacheBucketForKey(compositeKey, parsed.bucketId);
            }
        }
    },

    loadCacheFromDisk() {
        try {
            this.migrateLegacyCacheDataToSplitFilesSync();

            if (!this.translationCache) {
                const runtime = ensureTranslateCacheRuntime(new Map());
                this.translationCache = runtime.cache;
                this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
            }

            this.translationCache.clear();
            this.reverseCommandLookup = new Map();
            this.cacheBucketByCompositeKey = new Map();
            this.loadSplitCacheFromDisk();
            runCacheMigrationsIfNeeded(this);
            this.loadVariableTranslationSettingsFromDisk();

            this.notifyCacheRuntime('cache-loaded');
        } catch (error) {
            console.warn('[TranslateOnTheFly] Failed to load cache, starting fresh', error);
            const runtime = ensureTranslateCacheRuntime(new Map());
            this.translationCache = runtime.cache;
            this.lastSeenByCacheKey = runtime.lastSeenByCacheKey;
            this.reverseCommandLookup = new Map();
            this.cacheBucketByCompositeKey = new Map();
            this.safeVariableTranslationIds = [];
            this.safeVariableTranslationIdSet = new Set();
            this.notifyCacheRuntime('cache-load-failed-reset');
        }
    },

    // Temporary migration shim: migrate monolithic legacy cache into split files.
    migrateLegacyCacheDataToSplitFilesSync() {
        const persistedCache = this.cacheStorage.getAll();
        if (
            !persistedCache ||
            typeof persistedCache !== 'object' ||
            Array.isArray(persistedCache)
        ) {
            return;
        }

        const persistedKeys = Object.keys(persistedCache);
        if (persistedKeys.length === 0) {
            return;
        }

        const fullKeyToValue = new Map();
        const isLegacyDataOnly = persistedKeys.length === 1 && persistedKeys[0] === 'data';

        if (isLegacyDataOnly) {
            const legacyPayload = persistedCache.data;
            if (typeof legacyPayload === 'string') {
                try {
                    const entries = JSON.parse(legacyPayload);
                    if (Array.isArray(entries)) {
                        for (const [key, value] of entries) {
                            if (!key) {
                                continue;
                            }
                            fullKeyToValue.set(key, this.normalizeCacheValue(value));
                        }
                    }
                } catch (error) {
                    console.warn(
                        '[TranslateOnTheFly] Legacy cache migration failed to parse payload',
                        error
                    );
                }
            }
        } else {
            for (const [key, value] of Object.entries(persistedCache)) {
                if (!key || key === 'data') {
                    continue;
                }
                fullKeyToValue.set(key, this.normalizeCacheValue(value));
            }
        }

        if (fullKeyToValue.size === 0) {
            this.cacheStorage.setAll({});
            return;
        }

        const buckets = new Map();
        for (const [key, value] of fullKeyToValue.entries()) {
            const parsed = this.parseCompositeCacheKey(key);
            if (!parsed) {
                continue;
            }

            const bucketId = this.getCacheBucketId(parsed.type, parsed.langPair);
            if (!bucketId) {
                continue;
            }

            if (!buckets.has(bucketId)) {
                buckets.set(bucketId, {});
            }
            buckets.get(bucketId)[parsed.textKey] = value;
        }

        this.ensureSplitCacheDirectorySync();
        for (const [bucketId, payload] of buckets.entries()) {
            const filePath = this.getSplitCacheFilePathFromBucketId(bucketId);
            if (!filePath) {
                continue;
            }
            this.writeJsonFileAtomicSync(filePath, payload);
        }

        this.cacheStorage.setAll({});
        console.log(
            `[TranslateOnTheFly] Migrated monolithic cache to split files (${fullKeyToValue.size} entries, ${buckets.size} files)`
        );
    },

    scheduled: false,
    saving: false,
    flushTimer: null,
    pendingFullCacheRewrite: false,
    dirtyCacheBuckets: null,
    cacheBucketByCompositeKey: null,

    persistCache(changedKeys = null) {
        this.scheduled = true;

        if (!this.dirtyCacheBuckets) {
            this.dirtyCacheBuckets = new Set();
        }

        if (Array.isArray(changedKeys) && changedKeys.length > 0) {
            for (const key of changedKeys) {
                const bucketId = this.getBucketForCacheKey(key);
                if (bucketId) {
                    this.dirtyCacheBuckets.add(bucketId);
                } else {
                    this.pendingFullCacheRewrite = true;
                }
            }
        } else {
            this.pendingFullCacheRewrite = true;
        }

        if (this.saving || this.flushTimer) {
            return;
        }

        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flush();
        }, 1000);
    },

    async flush() {
        if (this.saving) {
            return;
        }
        this.saving = true;

        try {
            do {
                this.scheduled = false;

                const fullRewrite = this.pendingFullCacheRewrite;
                this.pendingFullCacheRewrite = false;

                const bucketsToWrite = new Set();
                if (fullRewrite) {
                    for (const bucketId of this.getAllSplitCacheBucketsFromDiskSync()) {
                        bucketsToWrite.add(bucketId);
                    }
                    for (const [compositeKey] of this.translationCache.entries()) {
                        const bucketId = this.getBucketForCacheKey(compositeKey);
                        if (bucketId) {
                            bucketsToWrite.add(bucketId);
                        }
                    }
                    this.dirtyCacheBuckets = new Set();
                } else {
                    for (const bucketId of this.dirtyCacheBuckets || []) {
                        bucketsToWrite.add(bucketId);
                    }
                    this.dirtyCacheBuckets = new Set();
                }

                this.ensureSplitCacheDirectorySync();

                for (const bucketId of bucketsToWrite) {
                    const parsedBucket = this.parseCacheBucketId(bucketId);
                    if (!parsedBucket) {
                        continue;
                    }

                    const payload = {};
                    const prefix = `${parsedBucket.type}:${parsedBucket.langPair}-`;
                    for (const [compositeKey, value] of this.translationCache.entries()) {
                        if (!compositeKey.startsWith(prefix)) {
                            continue;
                        }
                        const textKey = compositeKey.slice(prefix.length);
                        payload[textKey] = this.normalizeCacheValue(value);
                    }

                    const filePath = this.getSplitCacheFilePathFromBucketId(bucketId);
                    if (!filePath) {
                        continue;
                    }

                    if (Object.keys(payload).length === 0) {
                        const fs = this.getCacheFileSystem();
                        if (fs.existsSync(filePath)) {
                            await fs.promises.unlink(filePath);
                        }
                        continue;
                    }

                    await this.writeJsonFileAtomicAsync(filePath, payload);
                }
            } while (this.scheduled);
        } finally {
            this.saving = false;
        }
    },

    findPropertyDescriptorInChain(target, field) {
        let current = target;
        while (current) {
            const descriptor = Object.getOwnPropertyDescriptor(current, field);
            if (descriptor) {
                return descriptor;
            }
            current = Object.getPrototypeOf(current);
        }

        return null;
    },

    canAssignField(target, field) {
        if (!target) {
            return false;
        }

        const ownDescriptor = Object.getOwnPropertyDescriptor(target, field);
        if (ownDescriptor) {
            return !!ownDescriptor.writable || typeof ownDescriptor.set === 'function';
        }

        const prototypeDescriptor = this.findPropertyDescriptorInChain(
            Object.getPrototypeOf(target),
            field
        );
        if (!prototypeDescriptor) {
            return true;
        }

        return !!prototypeDescriptor.writable || typeof prototypeDescriptor.set === 'function';
    },

    tryAssignField(target, field, value) {
        if (!this.canAssignField(target, field)) {
            return false;
        }

        try {
            target[field] = value;
            return true;
        } catch (error) {
            return false;
        }
    },

    applyTranslatedFieldValueSafely({ item, itemInstance, field, translatedValue, warningScope }) {
        const warningSet =
            this._readonlyApplyCacheWarningSet || (this._readonlyApplyCacheWarningSet = new Set());
        const warningKey = `${warningScope}:${field}`;
        const backingField = `_${field}`;

        const assignedItem =
            this.tryAssignField(item, field, translatedValue) ||
            this.tryAssignField(item, backingField, translatedValue);

        let assignedInstance = false;
        if (itemInstance) {
            assignedInstance =
                this.tryAssignField(itemInstance, backingField, translatedValue) ||
                this.tryAssignField(itemInstance, field, translatedValue);
        }

        if (!assignedItem && !assignedInstance && !warningSet.has(warningKey)) {
            warningSet.add(warningKey);
            console.warn(
                `[TranslateOnTheFly] Skipped read-only field assignment for ${warningKey}`
            );
        }

        return assignedItem || assignedInstance;
    },

    applyCachedTranslations(
        dataContainer,
        fields,
        cacheKeyPrefix,
        instanceContainer,
        instanceFunctionName
    ) {
        let appliedCount = 0;
        for (let i = 1; i < dataContainer.length; i++) {
            const item = dataContainer[i];
            if (!item) continue;

            let itemInstance;
            if (
                instanceContainer &&
                instanceFunctionName &&
                typeof instanceContainer[instanceFunctionName] === 'function'
            ) {
                itemInstance = instanceContainer[instanceFunctionName](item.id);
            }

            if (!item._translateOriginal) {
                item._translateOriginal = {};
                for (const field of fields) {
                    item._translateOriginal[field] = item[field];
                }
            }

            for (const field of fields) {
                const originalValue = item._translateOriginal[field];
                if (
                    originalValue &&
                    typeof originalValue === 'string' &&
                    originalValue.trim() !== ''
                ) {
                    const cacheKey = this.getCacheKey(originalValue, `${cacheKeyPrefix}_${field}`);
                    if (this.hasUsableCacheValue(cacheKey)) {
                        const translatedValue = this.translationCache.get(cacheKey);
                        const assigned = this.applyTranslatedFieldValueSafely({
                            item,
                            itemInstance,
                            field,
                            translatedValue,
                            warningScope: cacheKeyPrefix,
                        });
                        if (assigned) {
                            appliedCount++;
                        }
                    }
                }
            }
        }
        return appliedCount;
    },

    getResolvedDataContainerDefinitions(allowedCachePrefixes = null) {
        const allowedSet = Array.isArray(allowedCachePrefixes)
            ? new Set(allowedCachePrefixes)
            : null;
        const resolved = [];

        for (const definition of DATA_CONTAINER_TRANSLATION_DEFINITIONS) {
            if (allowedSet && !allowedSet.has(definition.cachePrefix)) {
                continue;
            }

            const container = definition.getContainer?.();
            if (!Array.isArray(container)) {
                continue;
            }

            resolved.push({
                container,
                fields: definition.fields,
                cachePrefix: definition.cachePrefix,
                instanceContainer: definition.getInstanceContainer?.() || null,
                instanceFunctionName: definition.instanceFunctionName || null,
            });
        }

        return resolved;
    },

    checkIfDataIsLoaded() {
        return (
            !window.$dataItems ||
            !window.$dataSkills ||
            !window.$dataArmors ||
            !window.$dataWeapons ||
            !window.$dataMapInfos ||
            !window.$dataClasses ||
            !window.$dataEnemies
        );
    },

    applyCachedTranslationsToData() {
        if (this.checkIfDataIsLoaded()) {
            console.log(
                '[TranslateOnTheFly] Game data not fully loaded, cannot apply cached translations'
            );
            setTimeout(() => {
                this.applyCachedTranslationsToData();
            }, 2000);
            return;
        }

        let appliedCount = 0;
        const resolvedDefinitions = this.getResolvedDataContainerDefinitions();

        for (const definition of resolvedDefinitions) {
            appliedCount += this.applyCachedTranslations(
                definition.container,
                definition.fields,
                definition.cachePrefix,
                definition.instanceContainer,
                definition.instanceFunctionName || null
            );
        }

        if (appliedCount > 0) {
            console.log(
                `[TranslateOnTheFly] Applied ${appliedCount} cached translations to objects`
            );
        }
    },

    hasUntranslatedFields(dataObject, fields, type) {
        if (!dataObject._translateOriginal) {
            dataObject._translateOriginal = {};
            for (const field of fields) {
                dataObject._translateOriginal[field] = dataObject[field];
            }
        }

        for (const field of fields) {
            const value = dataObject._translateOriginal[field];
            if (value && typeof value === 'string' && value.trim() !== '') {
                const cacheKey = this.getCacheKey(value, `${type}_${field}`);
                if (!this.hasUsableCacheValue(cacheKey)) {
                    return true;
                }
            }
        }

        return false;
    },

    async translateDataBatch(dataObjects, fields, type, options = {}) {
        if (!Array.isArray(dataObjects) || !Array.isArray(fields) || !type) {
            return { successes: 0, failures: 0, stats: null };
        }

        const translated = await this.batchManager.runBatchedTranslation(
            [
                {
                    kind: 'dataObjects',
                    dataObjects,
                    fields,
                    type,
                    backgroundJob: !!options.backgroundJob,
                },
            ],
            {
                ...options,
                backgroundJob: !!options.backgroundJob,
                showSummary: false,
            }
        );

        return {
            successes: translated.successes.length,
            failures: translated.failures.length,
            stats: translated.stats,
        };
    },

    async translateAllMaps() {
        const validMaps = this.getValidMapInfos();
        if (validMaps.length === 0) {
            Alert.warn('No valid maps found');
            return;
        }

        const previousSelectedMapIds = Array.isArray(this.objectTranslationSelectedMapIds)
            ? [...this.objectTranslationSelectedMapIds]
            : null;

        try {
            this.objectTranslationSelectedMapIds = validMaps.map((map) => map.id);
            await this.runObjectTranslationJob(['commonEvents', 'mapEvents']);
        } finally {
            this.objectTranslationSelectedMapIds = previousSelectedMapIds;
        }
    },

    async translateMapEvents(
        mapData = null,
        mapNumber = null,
        totalMaps = null,
        progressLabel = null,
        options = {}
    ) {
        const currentMapData = window.$dataMap || null;
        const currentMapId =
            window.$gameMap && typeof window.$gameMap.mapId === 'function'
                ? Number(window.$gameMap.mapId()) || null
                : null;
        const resolvedMapData = mapData || currentMapData;
        const resolvedMapId = (resolvedMapData && Number(resolvedMapData._mapId)) || currentMapId;
        const resolvedMapNumber =
            mapNumber !== null && mapNumber !== undefined ? mapNumber : resolvedMapData ? 1 : null;
        const resolvedTotalMaps =
            totalMaps !== null && totalMaps !== undefined ? totalMaps : resolvedMapData ? 1 : null;

        const skipProcessLock = !!(options && options.skipProcessLock);
        let processStarted = false;

        if (!skipProcessLock) {
            if (!this.beginNonOtfTranslationProcess('map translation')) {
                return {
                    successCount: 0,
                    failureCount: 0,
                    totalCount: 0,
                    stats: null,
                };
            }
            processStarted = true;
        }

        if (!this.batchManager) {
            this.batchManager = createTranslationBatchManager(this);
        }

        const mapRequest = {
            kind: 'mapEvents',
            mapData: resolvedMapData || null,
            mapId: resolvedMapId || null,
            mapNumber: resolvedMapNumber,
            totalMaps: resolvedTotalMaps,
            progressLabel: progressLabel || (resolvedMapData ? 'translating map 1/1' : null),
            backgroundJob: !!(options && options.backgroundJob),
            mapIds: resolvedMapId
                ? [resolvedMapId]
                : typeof resolvedMapNumber === 'number' && resolvedMapNumber > 0
                  ? [resolvedMapNumber]
                  : null,
        };
        try {
            const translatedByKind = await this.batchManager.runBatchedTranslation([mapRequest], {
                ...options,
                translationPhaseLabel: progressLabel || 'translating map',
                backgroundJob: !!(options && options.backgroundJob),
                showSummary: mapNumber === null,
            });

            return {
                successCount: translatedByKind.successes.length,
                failureCount: translatedByKind.failures.length,
                totalCount: translatedByKind.successes.length + translatedByKind.failures.length,
                stats: translatedByKind.stats,
            };
        } finally {
            if (processStarted) {
                this.endNonOtfTranslationProcess();
            }
        }
    },
};
