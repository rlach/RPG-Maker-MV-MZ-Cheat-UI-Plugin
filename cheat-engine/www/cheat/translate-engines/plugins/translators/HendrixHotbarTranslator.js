import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** Hendrix_Hotbar_Creator (MZ, installed build). Catalogs display literals and parameters; preserves logic-owned values. */
export class HendrixHotbarTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'Hendrix_Hotbar_Creator';
    }
    getPluginLabel() {
        return 'Hendrix Hotbar Creator';
    }
    getCacheType() {
        return 'plugin_hendrix_hotbar_creator';
    }
    getParameterTextPattern() {
        return /(?:Text|Help|Message)$/;
    }
    isDisplayFragment(text) {
        return text === '空' || super.isDisplayFragment(text);
    }
}
