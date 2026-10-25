import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * Triacontane MessageAutoReplace v1.2.1 (MZ).
 * Game_Message.allText applies configured regex replacements without changing
 * the event data. Keep the exact input to applyTextReplace as the cache source;
 * reversing replacement rules is unsafe (multiple symbols may become one icon).
 * Standard map/common-event traversal already collects the authored messages.
 * Description replacements remain presentation-only; their source data is intact.
 */
export class MessageAutoReplaceTranslator extends BasePluginTranslator {
    constructor() {
        super();
        this.messageSources = new WeakMap();
    }

    getPluginName() {
        return 'MessageAutoReplace';
    }

    getCacheType() {
        return 'plugin_message_auto_replace';
    }

    collectUntranslated() {
        return [];
    }

    enablePluginTranslation() {
        const prototype = window.Game_Message?.prototype;
        if (
            typeof prototype?.applyTextReplace !== 'function' ||
            typeof prototype?.clear !== 'function'
        )
            return false;

        const translator = this;
        const originalReplace = prototype.applyTextReplace;
        prototype.applyTextReplace = function (text) {
            const result = originalReplace.apply(this, arguments);
            if (
                translator.isRuntimeTranslationActive() &&
                text !== result &&
                text === this._texts.join('\n')
            ) {
                let sources = translator.messageSources.get(this);
                if (!sources) {
                    sources = new Map();
                    translator.messageSources.set(this, sources);
                }
                sources.set(result, text);
            }
            return result;
        };

        const originalClear = prototype.clear;
        prototype.clear = function () {
            translator.messageSources.delete(this);
            return originalClear.apply(this, arguments);
        };
        return true;
    }

    resolveMessageCacheSourceText(context = {}) {
        if (context.mode === 'collection' || !this.isRuntimeTranslationActive(context.runtime)) {
            return null;
        }
        const message = context.gameMessage || window.$gameMessage;
        const recorded = this.messageSources.get(message)?.get(context.text);
        if (recorded !== undefined) return recorded;

        // Detection can run during the first lookup, before the scheduled hook
        // is installed. The raw message is still available at that point.
        const source = message?._texts?.join('\n');
        if (
            this.isUsableText(source) &&
            typeof message?.applyTextReplace === 'function' &&
            message.applyTextReplace(source) === context.text
        )
            return source;
        return null;
    }
}
