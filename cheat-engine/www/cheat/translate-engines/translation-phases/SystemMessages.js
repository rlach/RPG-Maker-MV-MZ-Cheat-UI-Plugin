import { BasePhase } from './BasePhase.js';
import {
    getSystemMessageCacheKey,
    getSystemMessagesSource,
    isCommandCacheSystemMessageKey,
} from './SystemMessageCacheRules.js';

export class SystemMessages extends BasePhase {
    static getInstance() {
        if (!SystemMessages._instance) {
            SystemMessages._instance = new SystemMessages();
        }
        return SystemMessages._instance;
    }

    getTranslationPhaseLabel() {
        return 'translating system messages';
    }

    getKind() {
        return 'systemMessages';
    }

    getPrimaryCacheKey(runtime, messageKey, messageValue) {
        return getSystemMessageCacheKey(runtime, messageKey, messageValue);
    }

    async createEntries() {
        return [
            {
                strategy: this,
                priorityMapId: 0,
            },
        ];
    }

    countAmountSync({ runtime }) {
        if (
            !window.$dataSystem ||
            !$dataSystem.terms ||
            !$dataSystem.terms.messages ||
            typeof $dataSystem.terms.messages !== 'object'
        ) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const sourceMessages = getSystemMessagesSource();
        if (!sourceMessages) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }

        const keys = Object.keys(sourceMessages || {});
        let total = 0;
        let left = 0;
        for (const key of keys) {
            const value = sourceMessages[key];
            if (typeof value !== 'string' || value.trim() === '') {
                continue;
            }

            total += 1;
            const cacheKey = this.getPrimaryCacheKey(runtime, key, value);
            if (!cacheKey || !runtime.hasUsableCacheValue(cacheKey)) {
                left += 1;
            }
        }

        return { total, left, totalStrings: total, leftStrings: left };
    }

    collectUntranslated({ runtime }) {
        if (
            !(
                window.$dataSystem &&
                $dataSystem.terms &&
                $dataSystem.terms.messages &&
                typeof $dataSystem.terms.messages === 'object'
            )
        ) {
            return [];
        }

        const sourceMessages = getSystemMessagesSource();
        if (!sourceMessages) {
            return [];
        }

        const pending = [];

        for (const key of Object.keys(sourceMessages || {})) {
            const value = sourceMessages[key];
            if (typeof value !== 'string' || value.trim() === '') {
                continue;
            }

            const cacheKey = this.getPrimaryCacheKey(runtime, key, value);
            if (!cacheKey || !runtime.hasUsableCacheValue(cacheKey)) {
                pending.push({
                    type: 'system_message',
                    id: `msg_${key}`,
                    value,
                    messageKey: key,
                    cacheKey,
                });
            }
        }

        return pending;
    }

    setData({ runtime, pendingItems, successes, failures }) {
        super.setData({ runtime, successes, failures });

        if (
            !window.$dataSystem ||
            !$dataSystem.terms ||
            !$dataSystem.terms.messages ||
            typeof $dataSystem.terms.messages !== 'object'
        ) {
            return;
        }

        const messageKeysByCacheKey = new Map();
        for (const entry of pendingItems || []) {
            if (!entry || !entry.cacheKey || !entry.messageKey) {
                continue;
            }

            const keys = messageKeysByCacheKey.get(entry.cacheKey) || [];
            keys.push(entry.messageKey);
            messageKeysByCacheKey.set(entry.cacheKey, keys);
        }

        for (const success of successes || []) {
            if (!success || !success.cacheKey) {
                continue;
            }

            const messageKeys = messageKeysByCacheKey.get(success.cacheKey);
            if (!messageKeys || messageKeys.length === 0) {
                continue;
            }

            for (const messageKey of messageKeys) {
                if (isCommandCacheSystemMessageKey(messageKey)) {
                    continue;
                }

                if (
                    $dataSystem.terms.messages &&
                    Object.prototype.hasOwnProperty.call($dataSystem.terms.messages, messageKey)
                ) {
                    $dataSystem.terms.messages[messageKey] = success.translated;
                }
            }
        }
    }

    applyDataOnLifecycle({ runtime } = {}) {
        if (
            !runtime ||
            !window.$dataSystem ||
            !$dataSystem.terms ||
            !$dataSystem.terms.messages ||
            typeof $dataSystem.terms.messages !== 'object'
        ) {
            return true;
        }

        const sourceMessages = getSystemMessagesSource();
        const messages = $dataSystem.terms.messages;
        if (!sourceMessages) {
            return true;
        }

        let applied = 0;

        for (const key of Object.keys(sourceMessages || {})) {
            const sourceValue = sourceMessages[key];

            if (isCommandCacheSystemMessageKey(key)) {
                continue;
            }

            const cacheKey = this.getPrimaryCacheKey(runtime, key, sourceValue);
            if (!cacheKey || !runtime.hasUsableCacheValue(cacheKey)) {
                continue;
            }

            const translated = runtime.translationCache.get(cacheKey);
            if (translated !== undefined && Object.prototype.hasOwnProperty.call(messages, key)) {
                messages[key] = translated;
                applied += 1;
            }
        }

        if (applied > 0) {
            console.log(`[SystemMessages] Applied ${applied} cached system messages`);
        }

        return true;
    }
}
