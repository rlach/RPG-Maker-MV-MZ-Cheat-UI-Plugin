import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

export class Rj01477834Translator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'RJ01477834';
    }
    getPluginAliases() {
        return ['Untitled-1'];
    }
    detectPlugin() {
        return (
            super.detectPlugin() &&
            typeof window._PD_EventInfomation?.convertEscapeCharacters === 'function'
        );
    }
    getCacheType() {
        return 'plugin_rj01477834';
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    collectCommandTexts(list = []) {
        for (const command of list || []) {
            if (![108, 408].includes(command.code)) continue;
            for (const token of String(command.parameters[0])
                .toLowerCase()
                .replace(/\u3000/g, ' ')
                .split(' ')) {
                const [name, text] = token.replace(/[:：]/g, ',').split(',');
                if (name === 'info' && this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
    enablePluginTranslation() {
        const plugin = window._PD_EventInfomation;
        if (typeof plugin?.convertEscapeCharacters !== 'function') return false;
        const original = plugin.convertEscapeCharacters;
        const translator = this;
        plugin.convertEscapeCharacters = function (text) {
            const translated = translator.resolveRuntimeTranslation(
                text,
                translator.getRuntime(),
                translator.getCacheType(),
                { requireRuntimeTranslationActive: true }
            );
            return original.call(this, translated);
        };
        return true;
    }
}
