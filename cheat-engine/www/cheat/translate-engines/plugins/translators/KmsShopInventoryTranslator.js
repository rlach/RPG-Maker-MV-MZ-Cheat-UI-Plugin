import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/**
 * KMS_ShopInventory v0.1.0 (MV). Catalogs stock caption and sold-out text from
 * plugin parameters. Translates drawing and width measurement, leaving stock logic intact.
 */
export class KmsShopInventoryTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'KMS_ShopInventory';
    }
    getCacheType() {
        return 'plugin_kms_shop_inventory';
    }
    getParameterTextPattern() {
        return /^(?:Caption for stock|Sold out text)$/;
    }
    collectSourceCatalog() {
        return { entries: [] };
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        this.hookDrawing(window.Window_Base.prototype, 'textWidth');
        return true;
    }
}
