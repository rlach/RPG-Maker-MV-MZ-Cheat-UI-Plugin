import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** DarkPlasma_ChoiceExtension (MZ). Conditions remain native; only displayed choices are scanned. */
export class DarkPlasmaChoiceExtensionTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'DarkPlasma_ChoiceExtension';
    }
    getCacheType() {
        return 'plugin_darkplasma_choice_extension';
    }
    collectCommandTexts(list) {
        for (const command of list || []) {
            if (command?.code !== 102) continue;
            for (const source of command.parameters[0]) {
                const text = source.replace(/\s*if\((.*?)\)/, '').replace(/\s*en\((.*?)\)/, '');
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
}
