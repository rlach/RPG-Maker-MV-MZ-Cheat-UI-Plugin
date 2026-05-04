import { BasePluginTranslator } from '../BasePluginTranslator.js';

// SetMessageFontSize hooks Game_Message.prototype.add and prepends \FS[N] to every
// message line, so the assembled runtime text looks like:
//   \FS[0]\FF[03_ki]\N<フリジア>\n\FS[0]いかがなさいましたか？
// but the traversal cache key is keyed on the original event text:
//   \FF[03_ki]\N<フリジア>\nいかがなさいましたか？
//
// Strip \FS[N] sequences from line starts so the runtime lookup matches the cache key.
const FS_LINE_PREFIX_RE = /(^|\n)\\FS\[\d+\]/g;

export class SetMessageFontSizeTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'SetMessageFontSize';
    }

    countPluginAmountSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    /**
     * Strip \FS[N] prefixes from the start of each line so the runtime text matches
     * the original cache key captured during traversal.
     *
     * @param {object} context - { text, mode, runtime, ... }
     * @returns {string|null}
     */
    resolveMessageCacheSourceText(context = {}) {
        const text = typeof context.text === 'string' ? context.text : '';
        console.log(`[SetMessageFontSizeTranslator] resolveMessageCacheSourceText:`, {
            text,
            context,
        });
        if (!text) {
            return null;
        }

        const stripped = text.replaceAll(FS_LINE_PREFIX_RE, '$1');
        console.log(`[SetMessageFontSizeTranslator] stripped text:`, { stripped });
        if (stripped === text) {
            return null;
        }

        return stripped;
    }
}
