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
    shouldScanEventData() {
        // ItemList event commands override the defaults with per-reward GetText.
        return true;
    }
    collectMapTexts() {
        // Map names retain their dedicated map_name cache keys.
    }
    getParameterTextPattern() {
        return /(?:Text|Message)$/;
    }
}
