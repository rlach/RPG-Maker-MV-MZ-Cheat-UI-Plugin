import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** SimpleEquipUpgrade v1.4.3 (MZ). Upgrade labels, titles, costs and input hints. */
export class SimpleEquipUpgradeTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'SimpleEquipUpgrade';
    }
    getCacheType() {
        return 'plugin_simple_equip_upgrade';
    }
    shouldScanEventData() {
        return false;
    }
    isDisplayFragment() {
        return false;
    }
}
