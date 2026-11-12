import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** MNKR_SupponShopStockMZ (MZ, installed build). Catalogs display literals and parameters; preserves logic-owned values. */
export class SupponShopStockTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'MNKR_SupponShopStockMZ';
    }
    getPluginLabel() {
        return 'MNKR Suppon Shop Stock MZ';
    }
    getCacheType() {
        return 'plugin_mnkr_supponshopstockmz';
    }
    getParameterTextPattern() {
        return /^Label of (?:stock Number|sold out)$/;
    }
}
