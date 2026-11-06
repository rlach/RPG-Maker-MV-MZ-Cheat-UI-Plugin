import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** EquipRemoveUi v1.0.0 (MZ). Translate the remove-equipment label and help text. */
export class EquipRemoveUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'EquipRemoveUi';
    }
    getPluginLabel() {
        return 'Equip Remove UI';
    }
    getCacheType() {
        return 'plugin_equip_remove_ui';
    }
    async buildCatalog() {
        const params = this.findPluginEntry().parameters;
        for (const text of [params.removeText, params.removeDesc]) {
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
}
