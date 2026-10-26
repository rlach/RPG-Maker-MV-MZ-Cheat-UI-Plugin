import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * FTKR_ExMessageWindow2 v2.4.0 (MV), including YEP_MessageCore v1.19.
 * Standard event scanning already collects Show Text/Choices. FTKR's separate
 * Window_MessageEx.startMessage bypasses the core message translation hook.
 * Translate only presentation buffers; keep every numbered Game_Message intact.
 */
export class FtkrExMessageWindowTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'FTKR_ExMessageWindow2';
    }
    getPluginLabel() {
        return 'FTKR extended message windows';
    }

    enablePluginTranslation() {
        const message = window.Window_MessageEx?.prototype;
        const choices = window.Window_ChoiceListEx?.prototype;
        if (typeof message?.startMessage !== 'function' || typeof choices?.start !== 'function')
            return false;
        const translator = this;
        const startMessage = message.startMessage;
        message.startMessage = function (...args) {
            const buffer = this._gameMessage;
            const texts = buffer._texts;
            const runtime = translator.getRuntime();
            const source = buffer.allText();
            const translated = translator.resolveRuntimeMessageTranslation(source, runtime, {
                hasPortrait: !!buffer.faceName(),
                fallbackCacheTypes: ['plugin_yep_message_core'],
            });
            if (translated !== source) buffer._texts = translated.split('\n');
            try {
                return startMessage.apply(this, args);
            } finally {
                buffer._texts = texts;
            }
        };
        const startChoices = choices.start;
        choices.start = function (...args) {
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime))
                return startChoices.apply(this, args);
            const buffer = this._gameMessage;
            const source = buffer._choices;
            buffer._choices = source.map((text) =>
                translator.resolveRuntimeTranslation(text, runtime, 'choice')
            );
            try {
                return startChoices.apply(this, args);
            } finally {
                buffer._choices = source;
            }
        };
        return true;
    }
}
