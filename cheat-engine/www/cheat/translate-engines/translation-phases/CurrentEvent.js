import { BasePhase } from './BasePhase.js';
import { collectEventCommandEntries, nameIsTag } from '../../js/EventCommandTraversal.js';
import { buildPluginTraversalOptions } from '../plugins/PluginMessageEntryNormalizer.js';

function isMessageTextType(type) {
    return type === 'message' || type === 'message_portrait';
}

export class CurrentEvent extends BasePhase {
    static getInstance() {
        if (!CurrentEvent._instance) {
            CurrentEvent._instance = new CurrentEvent();
        }
        return CurrentEvent._instance;
    }

    constructor(options = {}) {
        super();
        this._state = {
            items: /** @type {any[]} */ ([]),
            normalizedCurrentText: '',
            messageHasPortrait: false,
            pendingKeys: new Set(),
            textSuccesses: 0,
        };
        this.configure(options);
    }

    _ensureState() {
        if (!this._state) {
            this._state = {
                items: /** @type {any[]} */ ([]),
                normalizedCurrentText: this.currentText || '',
                messageHasPortrait: !!this.messageHasPortrait,
                pendingKeys: new Set(),
                textSuccesses: 0,
            };
        }

        return this._state;
    }

    configure(options = {}) {
        this.currentText = options.currentText || '';
        this.currentSpeakerName = options.currentSpeakerName || '';
        this.cacheKey = options.cacheKey || '';
        this.maxDepth = options.maxDepth;
        this.messageHasPortrait = !!options.messageHasPortrait;
        this._state = {
            items: /** @type {any[]} */ ([]),
            normalizedCurrentText: this.currentText || '',
            messageHasPortrait: this.messageHasPortrait,
            pendingKeys: new Set(),
            textSuccesses: 0,
        };
        return this;
    }

    getTranslationPhaseLabel() {
        return 'OTF - translating event';
    }

    getKind() {
        return 'currentEvent';
    }

    async createEntries({ request, runtime }) {
        const gameMessage = runtime.currentGameMessage || window.$gameMessage;
        if (!gameMessage || typeof gameMessage.allText !== 'function') {
            return [];
        }

        const originalText =
            request.currentText ||
            gameMessage._translateOriginalText ||
            gameMessage.allText() ||
            '';
        const originalSpeakerName =
            request.currentSpeakerName ||
            gameMessage._translateOriginalSpeaker ||
            gameMessage._speakerName ||
            '';
        const messageHasPortrait =
            typeof request.hasPortrait === 'boolean'
                ? request.hasPortrait
                : runtime.hasCurrentMessagePortrait(gameMessage);
        const fullEvent = !!request.fullEvent;
        const maxDepth = fullEvent ? request.maxDepth : 0;

        if (request.forceRefreshCache) {
            const refreshKeys = [];
            if (originalText?.trim()) {
                refreshKeys.push(
                    ...runtime.getMessageCacheLookupKeys(originalText, {
                        hasPortrait: messageHasPortrait,
                    })
                );
            }
            if (originalSpeakerName?.trim() && !nameIsTag(originalSpeakerName)) {
                refreshKeys.push(runtime.getCacheKey(originalSpeakerName, 'speaker'));
            }
            const choices = gameMessage.choices ? gameMessage.choices() : [];
            const originalChoices = gameMessage._translateOriginalChoices || choices;
            for (const choice of originalChoices || []) {
                if (choice && String(choice).trim()) {
                    refreshKeys.push(runtime.getCacheKey(choice, 'choice'));
                }
            }

            for (const key of refreshKeys) {
                runtime.deleteCacheValue(key, {
                    persist: false,
                    notify: false,
                    deleteSeen: false,
                });
            }
            runtime.persistCache(refreshKeys);
            runtime.notifyCacheRuntime('cache-force-retranslate');
        }

        return [
            {
                strategy: this.configure({
                    currentText: originalText,
                    currentSpeakerName: originalSpeakerName,
                    cacheKey: request.cacheKey || '',
                    maxDepth,
                    messageHasPortrait,
                }),
                priorityMapId: runtime.getCurrentMapIdForPhasePriority
                    ? runtime.getCurrentMapIdForPhasePriority()
                    : 0,
            },
        ];
    }

    countAmountSync() {
        return { total: 1, left: 1, totalStrings: 1, leftStrings: 1 };
    }

    collectAheadItems(runtime, currentText, currentSpeaker, interpreter, options = {}) {
        const charLimit = options.charLimit || runtime.charLimit;
        const maxItems = options.maxItems || runtime.batchItemsLimit || 300;
        const maxDepth = options.maxDepth === undefined ? 999 : options.maxDepth;
        const messageType = runtime.getMessageCacheType({
            hasPortrait: !!options.messageHasPortrait,
        });

        console.log('[Lookahead] Starting collection', {
            charLimit,
            maxItems,
            maxDepth,
            currentText,
            currentSpeaker,
        });

        const items = [];
        let totalChars = 0;
        let itemIdCounter = 0;
        let stopReason = '';
        const seenCacheKeys = new Set();

        const pushItem = (type, value, force = false) => {
            if (value == null || typeof value !== 'string' || value.trim() === '') {
                return true;
            }

            const cacheKey = runtime.getCacheKey(value, type);
            if (!force) {
                // For message types check all variants so that a text already cached as
                // message_portrait is not re-harvested and stored again as message (or vice
                // versa), which would cause cache duplication and translation mismatches.
                const isMessageType = runtime.isMessageCacheType(type);
                const hasUsable = isMessageType
                    ? runtime
                          .getMessageCacheLookupKeys(value, {
                              hasPortrait: type === 'message_portrait',
                          })
                          .some((k) => runtime.hasUsableCacheValue(k))
                    : runtime.hasUsableCacheValue(cacheKey);
                if (hasUsable) {
                    return true;
                }
            }

            if (seenCacheKeys.has(cacheKey)) {
                return true;
            }

            if (!force && items.length >= maxItems) {
                stopReason = 'items limit reached';
                return false;
            }

            if (!force && totalChars + value.length > charLimit) {
                stopReason = 'charLimit reached';
                return false;
            }

            const id = `${type}_${itemIdCounter++}`;
            items.push({ type, id, value, cacheKey });
            totalChars += value.length;
            seenCacheKeys.add(cacheKey);

            return true;
        };

        if (currentText) pushItem(messageType, currentText, true);
        if (currentSpeaker) pushItem('speaker', currentSpeaker, true);

        if (maxDepth === 0 || !interpreter || !Array.isArray(interpreter._list)) {
            console.log('[Lookahead] Stopped: early return', {
                reason:
                    maxDepth === 0
                        ? 'maxDepth is 0'
                        : !interpreter
                          ? 'no interpreter'
                          : 'interpreter._list not array',
                maxDepth,
                hasInterpreter: !!interpreter,
                isListArray: interpreter && Array.isArray(interpreter._list),
                totalItems: items.length,
            });
            return items;
        }

        const list = interpreter._list;
        const entries = collectEventCommandEntries(list, {
            ...buildPluginTraversalOptions(runtime),
        });

        if (!entries.length) {
            return items;
        }

        const startCmdIndex = Math.max(0, Number(interpreter._index) || 0);
        let pivot = entries.findIndex(
            (entry) =>
                entry.cmdIndex >= startCmdIndex &&
                isMessageTextType(entry.type) &&
                entry.value === currentText
        );
        if (pivot < 0) {
            pivot = entries.findIndex(
                (entry) => isMessageTextType(entry.type) && entry.value === currentText
            );
        }
        if (pivot < 0) {
            pivot = entries.findIndex((entry) => entry.cmdIndex >= startCmdIndex);
        }
        if (pivot < 0) {
            pivot = 0;
        }

        for (let k = 0; k < entries.length; k++) {
            const idx = (pivot + k) % entries.length;
            const entry = entries[idx];
            if (!pushItem(entry.type, entry.value)) {
                break;
            }
        }

        console.log('[Lookahead] Scan completed', {
            totalCandidates: entries.length,
            listLength: list.length,
            totalItems: items.length,
            totalChars,
            reason: stopReason || 'loop ended',
        });

        return items;
    }

    collectMandatoryChoiceCacheKeys(runtime) {
        const mandatoryChoiceCacheKeys = [];
        if (window.$gameMessage && $gameMessage.isChoice?.()) {
            const currentChoices = $gameMessage._translateOriginalChoices || $gameMessage.choices();
            if (Array.isArray(currentChoices)) {
                for (const choice of currentChoices) {
                    mandatoryChoiceCacheKeys.push(runtime.getCacheKey(choice, 'choice'));
                }
            }
        }
        return mandatoryChoiceCacheKeys;
    }

    appendCurrentChoiceItems(runtime, items) {
        if (!(window.$gameMessage && $gameMessage.isChoice?.())) {
            return;
        }

        const currentChoices = $gameMessage._translateOriginalChoices || $gameMessage.choices();
        if (!Array.isArray(currentChoices)) {
            return;
        }

        for (let i = 0; i < currentChoices.length; i++) {
            const choice = currentChoices[i];
            const choiceCacheKey = runtime.getCacheKey(choice, 'choice');
            if (runtime.hasUsableCacheValue(choiceCacheKey)) {
                continue;
            }

            if (items.some((item) => item.cacheKey === choiceCacheKey)) {
                continue;
            }

            items.push({
                type: 'choice',
                id: `current_choice_${i}`,
                value: choice,
                cacheKey: choiceCacheKey,
                mandatory: true,
            });
        }
    }

    applyCurrentText(runtime, items, fallbackText, textSuccesses = 0) {
        const firstTextItem = items.find((item) => isMessageTextType(item.type));
        if (!firstTextItem) {
            return;
        }

        let translated = runtime.translationCache.get(firstTextItem.cacheKey);
        if (!translated) {
            const state = this._ensureState();
            const preferred = runtime.getPreferredMessageCacheEntry(
                firstTextItem.value || fallbackText || '',
                {
                    hasPortrait: !!state.messageHasPortrait,
                }
            );
            translated = preferred ? preferred.value : translated;
        }

        if (translated) {
            runtime.replaceMessageText(translated);
            runtime._translationApplied = true;

            runtime.translationCount += Math.max(0, Number(textSuccesses) || 0);
            runtime.saveSettings();
            return;
        }

        runtime.replaceMessageText(fallbackText || '');
        runtime._translationApplied = true;
    }

    applyCurrentChoices(runtime) {
        if (!(window.$gameMessage && $gameMessage.isChoice?.())) {
            return;
        }

        const originalChoices = $gameMessage._translateOriginalChoices || $gameMessage.choices();
        const translatedChoices = originalChoices.map((choice) => {
            const choiceCacheKey = runtime.getCacheKey(choice, 'choice');
            return runtime.translationCache.get(choiceCacheKey) || choice;
        });

        runtime.replaceChoiceText(translatedChoices);
    }

    collectUntranslated({ runtime }) {
        const state = this._ensureState();
        const interpreter = runtime.findMessageInterpreter();
        const normalized = runtime.resolveOriginalMessageContext(
            this.currentText,
            this.currentSpeakerName,
            interpreter
        );
        const normalizedCurrentText = normalized.text || this.currentText || '';
        const normalizedCurrentSpeaker = normalized.speaker || this.currentSpeakerName || '';

        const items = this.collectAheadItems(
            runtime,
            normalizedCurrentText,
            normalizedCurrentSpeaker,
            interpreter,
            {
                charLimit: Number.MAX_SAFE_INTEGER,
                maxItems: Number.MAX_SAFE_INTEGER,
                maxDepth: this.maxDepth,
                messageHasPortrait: this.messageHasPortrait,
            }
        );

        this.appendCurrentChoiceItems(runtime, items);
        state.items = items;
        state.normalizedCurrentText = normalizedCurrentText;
        state.messageHasPortrait = !!this.messageHasPortrait;

        if (!items.length) {
            return [];
        }

        const mandatoryCacheKeys = new Set();
        if (normalizedCurrentText) {
            mandatoryCacheKeys.add(
                runtime.getMessageCacheKey(normalizedCurrentText, {
                    hasPortrait: !!state.messageHasPortrait,
                })
            );
        }
        if (normalizedCurrentSpeaker) {
            mandatoryCacheKeys.add(runtime.getCacheKey(normalizedCurrentSpeaker, 'speaker'));
        }
        for (const choiceCacheKey of this.collectMandatoryChoiceCacheKeys(runtime)) {
            mandatoryCacheKeys.add(choiceCacheKey);
        }

        const uncached = items.filter((item) => {
            if (!item?.cacheKey) {
                return false;
            }

            if (runtime.hasUsableCacheValue(item.cacheKey)) {
                return false;
            }

            if (
                runtime.failedTranslations.has(item.cacheKey) &&
                !item.mandatory &&
                !mandatoryCacheKeys.has(item.cacheKey)
            ) {
                return false;
            }

            return true;
        });

        if (uncached.length === 0) {
            return [];
        }

        const uniqueMap = new Map();
        for (const item of uncached) {
            if (!uniqueMap.has(item.cacheKey)) {
                uniqueMap.set(item.cacheKey, item);
            }
        }
        const uniqueItemsRaw = Array.from(uniqueMap.values());

        const mandatoryItems = [];
        const optionalItems = [];
        for (const item of uniqueItemsRaw) {
            if (item.mandatory || mandatoryCacheKeys.has(item.cacheKey)) {
                mandatoryItems.push(item);
            } else {
                optionalItems.push(item);
            }
        }

        const uniqueItems = [...mandatoryItems, ...optionalItems];
        state.pendingKeys = new Set();
        state.textSuccesses = 0;

        for (const item of uniqueItems) {
            runtime.pendingTranslations.set(item.cacheKey, true);
            state.pendingKeys.add(item.cacheKey);
        }

        console.log(
            `[TranslateOnTheFly] Batch translating ${uniqueItems.length} items (${uniqueItems.filter((item) => isMessageTextType(item.type)).length} texts, ${uniqueItems.filter((item) => item.type === 'speaker').length} speakers, ${uniqueItems.filter((item) => item.type === 'choice').length} choices)`
        );

        return uniqueItems;
    }

    setData({ runtime, successes, failures }) {
        const state = this._ensureState();
        super.setData({ runtime, successes, failures });

        for (const success of successes || []) {
            if (success && isMessageTextType(success.type)) {
                state.textSuccesses += 1;
            }
        }

        for (const failure of failures || []) {
            if (!failure?.cacheKey) {
                continue;
            }
            runtime.setCacheValue(failure.cacheKey, '');
        }

        for (const failure of failures || []) {
            console.warn(
                `[TranslateOnTheFly] Failed to translate ${failure.type}:`,
                failure.value,
                '->',
                failure.rejectReason
            );
        }
    }

    finalizePhase({ runtime }) {
        const state = this._ensureState();
        try {
            this.applyCurrentText(
                runtime,
                state.items,
                state.normalizedCurrentText || this.currentText || '',
                state.textSuccesses
            );
            this.applyCurrentChoices(runtime);
        } finally {
            for (const key of state.pendingKeys || []) {
                runtime.pendingTranslations.delete(key);
            }
        }
    }

    handleFatalError({ runtime, error }) {
        const state = this._ensureState();
        console.error('[TranslateOnTheFly] Ahead translation error:', error);
        for (const key of state.pendingKeys || []) {
            runtime.failedTranslations.set(key, Date.now());
            runtime.pendingTranslations.delete(key);
        }
        runtime.replaceMessageText(this.currentText || '');
        runtime._translationApplied = true;
    }
}

/** @type {CurrentEvent|null} */
CurrentEvent._instance = null;
