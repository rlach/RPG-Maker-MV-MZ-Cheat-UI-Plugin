import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * biyifeifei languageTranslation (unversioned MV variant, RJ01594695).
 * Native localization removes braces only for keys in languageMap. Translated
 * payloads no longer match that dictionary. Finish reference expansion at the
 * presentation boundary, keeping existing cache keys and dictionary data intact.
 */
export class LanguageTranslationTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'languageTranslation';
    }

    getPluginLabel() {
        return 'Language Translation';
    }

    getCacheType() {
        return 'plugin_language_translation';
    }

    enablePluginTranslation() {
        const base = window.Window_Base?.prototype;
        const message = window.Window_Message?.prototype;
        if (
            typeof window.gl_translate !== 'function' ||
            typeof base?.drawText !== 'function' ||
            typeof base?.drawTextEx !== 'function' ||
            typeof message?.convertEscapeCharacters !== 'function'
        )
            return false;

        const nativeTranslate = window.gl_translate;
        const translator = this;
        const displayText = (text) => {
            if (typeof text !== 'string' || !translator.isRuntimeTranslationActive()) return text;
            // Resolve official references first. Preserve escaped font-size
            // controls (\\{ and ESC + {), including those inside a reference.
            return nativeTranslate(text).replace(
                // eslint-disable-next-line no-control-regex -- RPG Maker escape prefix.
                /(?<![\\\x1b])\{([^{}]*)\}/g,
                '$1'
            );
        };
        window.gl_translate = function (...args) {
            return translator.isRuntimeTranslationActive()
                ? displayText(args[0])
                : nativeTranslate.apply(this, args);
        };
        for (const method of ['drawText', 'drawTextEx']) {
            const original = base[method];
            base[method] = function (text, ...args) {
                return original.call(this, displayText(text), ...args);
            };
        }
        const convert = message.convertEscapeCharacters;
        message.convertEscapeCharacters = function (...args) {
            return displayText(convert.apply(this, args));
        };
        return true;
    }
}
