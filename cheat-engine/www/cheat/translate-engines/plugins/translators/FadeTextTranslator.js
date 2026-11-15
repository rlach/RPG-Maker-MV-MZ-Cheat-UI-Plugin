import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

export class FadeTextTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'FadeText';
    }
    getCacheType() {
        return 'message';
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    collectCommandTexts(list = []) {
        for (const command of list || []) {
            if (command.code !== 356) continue;
            const [name, operation, text] = String(command.parameters[0]).split(' ');
            if (name === 'FadeText' && operation === 'add' && this.isUsableText(text))
                this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const prototype = window.Game_Map?.prototype;
        if (typeof prototype?.addFadeText !== 'function') return false;
        const original = prototype.addFadeText;
        const translator = this;
        prototype.addFadeText = function (text, ...args) {
            return original.call(
                this,
                translator.resolveRuntimeMessageTranslation(text, translator.getRuntime(), {
                    hasPortrait: false,
                }),
                ...args
            );
        };
        return true;
    }
}
