import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** NYA_PH_Warehouse (MZ, installed build). Catalogs display literals and parameters; preserves logic-owned values. */
export class NyaWarehouseTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'NYA_PH_Warehouse';
    }
    getPluginLabel() {
        return 'NYA PH Warehouse';
    }
    getCacheType() {
        return 'plugin_nya_ph_warehouse';
    }
    getParameterTextPattern() {
        return /(?:Text| Format| title| message|Exit Confirm Btn (?:Ok|Cancel))$/;
    }
    shouldScanEventData() {
        return true;
    }
    collectCommandTexts(list = []) {
        super.collectCommandTexts(list);
        for (const command of list || []) {
            if (command.code !== 357 || command.parameters[0] !== this.getPluginName()) continue;
            for (const field of ['create_title', 'show_title']) {
                const text = command.parameters[3]?.[field];
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
}
