import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** MapTalkBalloon (MZ). Command captions and chase-comment alternatives share
 * the standard message pipeline. Resolve complete text before escape expansion/wrapping.
 */
export class MapTalkBalloonTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MapTalkBalloon';
    }
    getCacheType() {
        return 'message';
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    addBalloonText(value, trim = false) {
        if (typeof value !== 'string') return;
        let text = value.replace(/\\n(?!\s*\[)/g, '\n');
        if (trim) text = text.trim();
        if (this.isUsableText(text)) this.entries.set(text, { text });
    }
    async collectAdditionalTexts() {
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        for (const field of ['chaseFoundTexts', 'chaseLostTexts'])
            for (const text of parseJsonSafely(parameters[field], [])) this.addBalloonText(text);
    }
    collectCommandTexts(list = []) {
        const comments = [];
        for (const command of list || []) {
            if ([108, 408].includes(command.code)) comments.push(String(command.parameters[0]));
            if (
                command.code === 357 &&
                command.parameters[0]?.split('/').pop() === this.getPluginName() &&
                command.parameters[1] === 'showBalloon'
            )
                this.addBalloonText(command.parameters[3]?.text);
        }
        for (const match of comments
            .join('\n')
            .matchAll(
                /<\s*(?:発見セリフ|発見台詞|foundTalk|chaseFound|見失いセリフ|見失い台詞|lostTalk|chaseLost)\s*[:：]\s*([^>]*)>/gi
            ))
            for (const piece of match[1].split('|')) this.addBalloonText(piece, true);
    }
    enablePluginTranslation() {
        const prototype = window.Window_Base?.prototype;
        if (typeof prototype?.convertEscapeCharacters !== 'function') return false;
        const original = prototype.convertEscapeCharacters;
        const translator = this;
        prototype.convertEscapeCharacters = function (text) {
            if (this.constructor.name === 'Window_MapTalkBalloon')
                text = translator.resolveRuntimeMessageTranslation(text, translator.getRuntime(), {
                    hasPortrait: false,
                });
            return original.call(this, text);
        };
        return true;
    }
}
