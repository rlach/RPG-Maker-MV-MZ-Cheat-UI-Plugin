import { extractMessageEntryAt } from '../../../js/EventCommandTraversal.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_SH_MESSAGE_WINDOW_BG_TRANSLATOR_HOOKED__';
const NBX_TAG_PATTERN = /\\NBX\[(\d+)\]/i;
const NBX_TAG_PATTERN_GLOBAL = /\\NBX\[(\d+)\]/gi;

const SH_MESSAGE_WINDOW_BG_PLUGIN_TAGS = [
    {
        description: 'SH messageWindowBg actor lookup',
        type: 'withNumericParameter',
        tagSymbol: 'NBX',
        requiredConsistency: true,
    },
];

function containsNbxTag(text) {
    return typeof text === 'string' && NBX_TAG_PATTERN.test(text);
}

function stripNbxTags(text) {
    return typeof text === 'string' ? text.replace(NBX_TAG_PATTERN_GLOBAL, '') : '';
}

export class SHMessageWindowBgTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'SH_messageWindowBg';
    }

    getPluginLabel() {
        return 'SH messageWindowBg';
    }

    getCacheType() {
        return 'plugin_sh_message_window_bg';
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return true;
        }

        const canHookAllText =
            typeof Game_Message !== 'undefined' &&
            !!Game_Message.prototype &&
            typeof Game_Message.prototype.allText === 'function';
        const canHookCommand101 =
            typeof Game_Interpreter !== 'undefined' &&
            !!Game_Interpreter.prototype &&
            typeof Game_Interpreter.prototype.command101 === 'function';
        const canHookClear =
            typeof Game_Message !== 'undefined' &&
            !!Game_Message.prototype &&
            typeof Game_Message.prototype.clear === 'function';

        if (!canHookAllText && !canHookCommand101 && !canHookClear) {
            return false;
        }

        this.registerPluginCustomTags(SH_MESSAGE_WINDOW_BG_PLUGIN_TAGS);

        if (canHookAllText) {
            const originalAllText = Game_Message.prototype.allText;

            Game_Message.prototype.allText = function () {
                const text = originalAllText.apply(this, arguments);

                if (!this._isNbx) {
                    return text;
                }

                return stripNbxTags(typeof text === 'string' ? text : text ? String(text) : '');
            };
        }

        if (canHookCommand101) {
            const originalCommand101 = Game_Interpreter.prototype.command101;

            Game_Interpreter.prototype.command101 = function () {
                const messageEntry = extractMessageEntryAt(this._list, this._index);
                const result = originalCommand101.apply(this, arguments);

                if (typeof $gameMessage === 'undefined' || result !== true) {
                    return result;
                }

                const rawText = typeof messageEntry?.text === 'string' ? messageEntry.text : '';
                const hasNbx = containsNbxTag(rawText);
                const hasExplicitSpeaker =
                    typeof messageEntry?.speaker === 'string' && messageEntry.speaker.trim() !== '';

                if (hasNbx && !hasExplicitSpeaker) {
                    $gameMessage._isNbx = true;
                    $gameMessage._translateOriginalText = rawText;
                } else {
                    delete $gameMessage._isNbx;
                }

                return result;
            };
        }

        if (canHookClear) {
            const originalClear = Game_Message.prototype.clear;
            Game_Message.prototype.clear = function () {
                originalClear.apply(this, arguments);
                delete this._isNbx;
            };
        }

        window[RUNTIME_HOOK_GUARD] = true;
        return true;
    }

    collectUntranslated({ runtime }) {
        void runtime;
        return [];
    }

    getCachedCountsSync({ runtime }) {
        void runtime;
        return {
            total: 0,
            left: 0,
            totalStrings: 0,
            leftStrings: 0,
        };
    }
}
