import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** MPP_EquipStatusEX (MZ, installed build). Catalogs display literals and parameters; preserves logic-owned values. */
export class MppEquipStatusExTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'MPP_EquipStatusEX';
    }
    getPluginLabel() {
        return 'MPP Equip Status EX';
    }
    getCacheType() {
        return 'plugin_mpp_equipstatusex';
    }
    getParameterTextPattern() {
        return /^Terms /;
    }
}
