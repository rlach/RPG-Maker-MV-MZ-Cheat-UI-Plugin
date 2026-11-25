import { BasePluginTranslator } from '../BasePluginTranslator.js';

const CACHE_TYPE = 'plugin_call_enemy';

/**
 * CallEnemy.js (MV)
 *
 * Translates enemy summon battle messages (SuccessMessage e.g. "%1があらわれた！"
 * and FailureMessage e.g. "しかし だれもこなかった！") when Game_Action.prototype.showCallMessage
 * adds them to $gameMessage.
 */
export class CallEnemyTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'CallEnemy';
    }

    getPluginLabel() {
        return 'CallEnemy';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getMessagesFromParameters() {
        const entry = this.findPluginEntry(this.getPluginName());
        const params =
            entry?.parameters || window.PluginManager?.parameters?.(this.getPluginName()) || {};
        const successMsg = String(params.SuccessMessage || '%1があらわれた！').trim();
        const failureMsg = String(params.FailureMessage || 'しかし だれもこなかった！').trim();
        return { successMsg, failureMsg };
    }

    enablePluginTranslation() {
        const actionProto = window.Game_Action?.prototype;
        if (!actionProto || typeof actionProto.showCallMessage !== 'function') {
            return false;
        }

        const translator = this;
        const originalShowCallMessage = actionProto.showCallMessage;

        actionProto.showCallMessage = function (enemy, success) {
            const runtime = translator.getRuntime();
            const gameMessage = window.$gameMessage;
            if (
                !translator.isRuntimeTranslationActive(runtime) ||
                !gameMessage ||
                typeof gameMessage.add !== 'function'
            ) {
                return originalShowCallMessage.apply(this, arguments);
            }

            const { successMsg, failureMsg } = translator.getMessagesFromParameters();
            if (success && enemy) {
                const translatedTemplate = translator.resolveRuntimeTranslation(
                    successMsg,
                    runtime,
                    [CACHE_TYPE, 'system_message'],
                    {
                        requireRuntimeTranslationActive: true,
                        missValue: successMsg,
                    }
                );
                const rawEnemyName = typeof enemy.name === 'function' ? enemy.name() : '';
                const translatedEnemyName = translator.resolveRuntimeTranslation(
                    rawEnemyName,
                    runtime,
                    ['enemy_name'],
                    {
                        requireRuntimeTranslationActive: true,
                        missValue: rawEnemyName,
                        harvestMissing: false,
                    }
                );
                const formatted = String(translatedTemplate).replace('%1', translatedEnemyName);
                const rawFormatted = String(successMsg).replace('%1', rawEnemyName);
                if (
                    typeof runtime.getMessageCacheKey === 'function' &&
                    typeof runtime.setCacheValue === 'function'
                ) {
                    const msgKey = runtime.getMessageCacheKey(rawFormatted, { hasPortrait: false });
                    runtime.setCacheValue(msgKey, formatted, { persist: false, notify: false });
                }
                return gameMessage.add(formatted);
            }

            const translatedFailure = translator.resolveRuntimeTranslation(
                failureMsg,
                runtime,
                [CACHE_TYPE, 'system_message'],
                {
                    requireRuntimeTranslationActive: true,
                    missValue: failureMsg,
                }
            );
            if (
                typeof runtime.getMessageCacheKey === 'function' &&
                typeof runtime.setCacheValue === 'function'
            ) {
                const msgKey = runtime.getMessageCacheKey(failureMsg, { hasPortrait: false });
                runtime.setCacheValue(msgKey, translatedFailure, { persist: false, notify: false });
            }
            return gameMessage.add(translatedFailure);
        };

        return true;
    }

    buildPendingItems(runtime) {
        const { successMsg, failureMsg } = this.getMessagesFromParameters();
        const items = [];
        for (const text of [successMsg, failureMsg]) {
            if (!this.isUsableText(text)) {
                continue;
            }
            const cacheKey = runtime.getCacheKey(text, CACHE_TYPE);
            items.push({
                type: CACHE_TYPE,
                id: `${CACHE_TYPE}_${items.length}`,
                value: text,
                cacheKey,
            });
        }
        return items;
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }
        return this.buildPendingItems(runtime).filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        );
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }
        const items = this.buildPendingItems(runtime);
        const total = items.length;
        const left = items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey)).length;
        return { total, left, totalStrings: total, leftStrings: left };
    }
}
