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
        for (let index = 0; index < (list || []).length; index++) {
            const command = list[index];
            // Awaya Matana FadeText consumes ordinary scrolling-text blocks.
            if (command.code === 105) {
                const lines = [];
                while (list[index + 1]?.code === 405)
                    lines.push(String(list[++index].parameters[0]));
                const text = lines.join('\n');
                if (this.isUsableText(text)) this.entries.set(text, { text });
                continue;
            }
            if (command.code !== 356) continue;
            const [name, operation, text] = String(command.parameters[0]).split(' ');
            if (name === 'FadeText' && operation === 'add' && this.isUsableText(text))
                this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const prototype = window.Game_Map?.prototype;
        if (typeof prototype?.addFadeText !== 'function') {
            const messagePrototype = window.Game_Message?.prototype;
            if (
                typeof messagePrototype?.fadeMode !== 'function' ||
                typeof messagePrototype.allText !== 'function'
            )
                return false;
            const original = messagePrototype.allText;
            const translator = this;
            messagePrototype.allText = function (...args) {
                const text = original.apply(this, args);
                if (!this.fadeMode()) return text;
                return translator.resolveRuntimeMessageTranslation(text, translator.getRuntime(), {
                    hasPortrait: false,
                });
            };
            return true;
        }
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
