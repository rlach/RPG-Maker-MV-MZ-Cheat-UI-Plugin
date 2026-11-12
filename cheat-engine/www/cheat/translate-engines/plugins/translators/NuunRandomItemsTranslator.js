import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** NUUN_RandomItems (MZ, installed build). Catalogs display literals and parameters; preserves logic-owned values. */
export class NuunRandomItemsTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'NUUN_RandomItems';
    }
    getPluginLabel() {
        return 'NUUN Random Items';
    }
    getCacheType() {
        return 'plugin_nuun_randomitems';
    }
    getParameterTextPattern() {
        return /(?:Text|Message)$/;
    }
}
