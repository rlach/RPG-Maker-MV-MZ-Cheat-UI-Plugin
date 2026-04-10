import { BasePluginTranslator } from '../BasePluginTranslator.js';

function getTranslationRuntime() {
    return typeof window.__ensureTranslationRuntime === 'function'
        ? window.__ensureTranslationRuntime()
        : window.__TranslationRuntime || null;
}

function getSafeCurrentMessageText() {
    if (!window.$gameMessage) {
        return '';
    }

    if (typeof $gameMessage._translateOriginalText === 'string') {
        return $gameMessage._translateOriginalText;
    }

    if (typeof $gameMessage.allText === 'function') {
        try {
            const text = $gameMessage.allText();
            return typeof text === 'string' ? text : text ? String(text) : '';
        } catch (_error) {
            // Fall through to _texts below.
        }
    }

    const texts = Array.isArray($gameMessage._texts) ? $gameMessage._texts : [];
    return texts.join('\n');
}

function applyCachedCurrentMessageTranslation(runtime) {
    if (
        !runtime ||
        typeof runtime.getCacheKey !== 'function' ||
        typeof runtime.hasUsableCacheValue !== 'function' ||
        !(runtime.translationCache instanceof Map) ||
        !window.$gameMessage
    ) {
        return;
    }

    const originalText = getSafeCurrentMessageText();
    if (typeof originalText === 'string' && originalText.trim()) {
        const textCacheKey = runtime.getCacheKey(originalText, 'text');

        if (typeof runtime.markCacheKeySeen === 'function') {
            runtime.markCacheKeySeen(textCacheKey);
        }

        if (runtime.hasUsableCacheValue(textCacheKey)) {
            const cachedText = runtime.translationCache.get(textCacheKey);
            if (typeof cachedText === 'string' && cachedText.trim()) {
                $gameMessage._translateOriginalText = originalText;
                $gameMessage._texts = String(cachedText).split(/\r?\n/);
            }
        }
    }

    const originalSpeaker =
        $gameMessage._translateOriginalSpeaker ||
        (typeof $gameMessage._speakerName === 'string' ? $gameMessage._speakerName : '');

    if (typeof originalSpeaker === 'string' && originalSpeaker.trim()) {
        const speakerCacheKey = runtime.getCacheKey(originalSpeaker, 'speaker');

        if (typeof runtime.markCacheKeySeen === 'function') {
            runtime.markCacheKeySeen(speakerCacheKey);
        }

        if (runtime.hasUsableCacheValue(speakerCacheKey)) {
            const cachedSpeaker = runtime.translationCache.get(speakerCacheKey);
            if (typeof cachedSpeaker === 'string' && cachedSpeaker.trim()) {
                $gameMessage._translateOriginalSpeaker = originalSpeaker;
                $gameMessage._speakerName = cachedSpeaker;
            }
        }
    }
}

function applyCachedActorNameTranslation(actorNameWindow, runtime) {
    if (
        !actorNameWindow ||
        !runtime ||
        typeof runtime.getCacheKey !== 'function' ||
        typeof runtime.hasUsableCacheValue !== 'function' ||
        !(runtime.translationCache instanceof Map)
    ) {
        return;
    }

    const sourceName =
        actorNameWindow.SETTINGS && typeof actorNameWindow.SETTINGS.ACTOR_NAME === 'string'
            ? actorNameWindow.SETTINGS.ACTOR_NAME
            : '';

    if (!sourceName || !sourceName.trim()) {
        return;
    }

    const stripColorCode = (text) => String(text || '').replace(/\\C\[(\d+)\]/gi, '');
    const expandedSourceName =
        typeof actorNameWindow.convertEscapeCharacters === 'function'
            ? actorNameWindow.convertEscapeCharacters(sourceName)
            : sourceName;
    const currentSpeaker =
        window.$gameMessage && typeof $gameMessage._speakerName === 'string'
            ? $gameMessage._speakerName
            : '';
    const originalSpeaker =
        window.$gameMessage && typeof $gameMessage._translateOriginalSpeaker === 'string'
            ? $gameMessage._translateOriginalSpeaker
            : '';

    const sourceCandidates = [
        sourceName,
        expandedSourceName,
        stripColorCode(sourceName),
        stripColorCode(expandedSourceName),
        currentSpeaker,
        originalSpeaker,
    ].filter((candidate, index, array) => {
        const value = String(candidate || '').trim();
        return !!value && array.findIndex((item) => String(item || '').trim() === value) === index;
    });

    const keys = [];
    for (const candidate of sourceCandidates) {
        keys.push(runtime.getCacheKey(candidate, 'actor_name'));
        keys.push(runtime.getCacheKey(candidate, 'speaker'));
    }

    console.warn(
        '[MWSS-DEBUG] applyCachedActorNameTranslation called. sourceName:',
        sourceName,
        'currentSpeaker:',
        currentSpeaker,
        'keys:',
        keys
    );

    for (const cacheKey of keys) {
        if (typeof runtime.markCacheKeySeen === 'function') {
            runtime.markCacheKeySeen(cacheKey);
        }

        if (!runtime.hasUsableCacheValue(cacheKey)) {
            continue;
        }

        const cached = runtime.translationCache.get(cacheKey);
        if (typeof cached !== 'string' || !cached.trim()) {
            continue;
        }

        if (actorNameWindow._cheatTranslatedActorName === cached) {
            return;
        }

        actorNameWindow._cheatTranslatedActorName = cached;
        actorNameWindow.contents.clear();
        actorNameWindow.drawTextEx(cached, 0, 0);
        return;
    }
}

function patchActorNameWindowStart(actorNameWindow) {
    if (
        !actorNameWindow ||
        typeof actorNameWindow.start !== 'function' ||
        actorNameWindow._cheatMultipleWindowNameHooked
    ) {
        return;
    }

    const ctorName =
        actorNameWindow.constructor && typeof actorNameWindow.constructor.name === 'string'
            ? actorNameWindow.constructor.name
            : '';

    // TEMP DEBUG: log constructor name so we know what we're seeing
    console.warn('[MWSS-DEBUG] patchActorNameWindowStart ctorName:', ctorName);
    if (ctorName !== 'MultipleWindow_ActorName') {
        console.warn('[MWSS-DEBUG] Constructor name mismatch, skipping patch');
        return;
    }

    const originalStart = actorNameWindow.start;
    actorNameWindow.start = function () {
        try {
            const runtime = getTranslationRuntime();
            applyCachedActorNameTranslation(this, runtime);
        } catch (error) {
            console.warn(
                '[MultipleWindowSkinSystemTranslator] Failed to apply cached actor name translation in start()',
                error
            );
        }

        return originalStart.apply(this, arguments);
    };

    actorNameWindow._cheatMultipleWindowNameHooked = true;
}

export class MultipleWindowSkinSystemTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this._scanPrepared = false;
        this._scanEntries = [];
        this._scanPromise = null;
    }

    getPluginName() {
        return 'MultipleWindowSkinSystem';
    }

    getPluginLabel() {
        return 'MultipleWindowSkinSystem';
    }

    getCacheType() {
        return 'plugin_multiple_window_skin_system';
    }

    enablePluginTranslation() {
        if (window.__CHEAT_MULTIPLE_WINDOW_SKIN_SYSTEM_TRANSLATOR_HOOKED__) {
            return;
        }

        if (
            !window.Window_Message ||
            !Window_Message.prototype ||
            typeof Window_Message.prototype.startMessage !== 'function'
        ) {
            return;
        }

        const originalStartMessage = Window_Message.prototype.startMessage;
        Window_Message.prototype.startMessage = function () {
            const isMultipleWindowSkinSystemWindow =
                !!this &&
                !!this.SETTINGS &&
                !!this._actorNameWindow &&
                !!this._actorNameWindow.SETTINGS;

            if (!isMultipleWindowSkinSystemWindow) {
                return originalStartMessage.apply(this, arguments);
            }

            try {
                patchActorNameWindowStart(this._actorNameWindow);
                const runtime = getTranslationRuntime();
                applyCachedCurrentMessageTranslation(runtime);
                applyCachedActorNameTranslation(this._actorNameWindow, runtime);
            } catch (error) {
                console.warn(
                    '[MultipleWindowSkinSystemTranslator] Failed to apply cached message translation',
                    error
                );
            }

            return originalStartMessage.apply(this, arguments);
        };

        window.__CHEAT_MULTIPLE_WINDOW_SKIN_SYSTEM_TRANSLATOR_HOOKED__ = true;
    }

    async prepareTranslator() {
        if (!this.ensureDetection()) {
            return;
        }

        if (this._scanPrepared) {
            return;
        }

        if (this._scanPromise) {
            return this._scanPromise;
        }

        this._scanPromise = this.buildScanEntries()
            .then((entries) => {
                this._scanEntries = Array.isArray(entries) ? entries : [];
                this._scanPrepared = true;
            })
            .catch((error) => {
                console.warn('[MultipleWindowSkinSystemTranslator] Scan failed', error);
            })
            .finally(() => {
                this._scanPromise = null;
            });

        return this._scanPromise;
    }

    async buildScanEntries() {
        const entries = [];

        if (
            typeof window.PluginManager === 'undefined' ||
            typeof PluginManager.parameters !== 'function'
        ) {
            return entries;
        }

        const pluginParams = PluginManager.parameters('MultipleWindowSkinSystem');
        if (!pluginParams) {
            return entries;
        }

        const windowSettingsRaw = pluginParams['ウィンドウの設定'];
        if (typeof windowSettingsRaw !== 'string' || !windowSettingsRaw.trim()) {
            return entries;
        }

        let windowSettingsArray;
        try {
            windowSettingsArray = JSON.parse(windowSettingsRaw);
        } catch (e) {
            console.warn(
                '[MultipleWindowSkinSystemTranslator] Failed to parse ウィンドウの設定',
                e
            );
            return entries;
        }

        if (!Array.isArray(windowSettingsArray)) {
            return entries;
        }

        for (let i = 0; i < windowSettingsArray.length; i++) {
            const entryRaw = windowSettingsArray[i];
            if (!entryRaw || typeof entryRaw !== 'string') {
                continue;
            }

            let entry;
            try {
                entry = JSON.parse(entryRaw);
            } catch (e) {
                continue;
            }

            const actorName = entry && entry.actorName;
            if (typeof actorName !== 'string' || !actorName.trim()) {
                continue;
            }

            entries.push({
                text: actorName,
                source: {
                    scope: 'pluginConfig',
                    pluginName: 'MultipleWindowSkinSystem',
                    uniqueID: entry.uniqueID || String(i),
                    entryIndex: i,
                },
            });
        }

        return entries;
    }

    buildUniquePendingItems(panel) {
        const byCacheKey = new Map();

        for (const entry of this._scanEntries) {
            const text = typeof entry.text === 'string' ? entry.text : '';
            if (!text.trim()) {
                continue;
            }

            const cacheKey = panel.getCacheKey(text, 'actor_name');
            if (!byCacheKey.has(cacheKey)) {
                byCacheKey.set(cacheKey, {
                    type: 'actor_name',
                    id: `plugin_mwss_actor_name_${byCacheKey.size}`,
                    value: text,
                    cacheKey,
                });
            }
        }

        return Array.from(byCacheKey.values());
    }

    collectUntranslated({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return [];
        }

        const items = this.buildUniquePendingItems(panel);
        return items.filter((item) => !panel.hasUsableCacheValue(item.cacheKey));
    }

    countPluginAmountSync({ panel }) {
        if (!panel || typeof panel.getCacheKey !== 'function') {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const items = this.buildUniquePendingItems(panel);
        const totalStrings = items.length;
        const leftStrings = items.filter(
            (item) => !panel.hasUsableCacheValue(item.cacheKey)
        ).length;

        return {
            total: totalStrings,
            left: leftStrings,
            totalStrings,
            leftStrings,
        };
    }
}
