import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** NYA_PNDK_LuggageCapacity (MZ, installed build). Catalogs display literals and parameters; preserves logic-owned values. */
export class NyaLuggageCapacityTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'NYA_PNDK_LuggageCapacity';
    }
    getPluginLabel() {
        return 'NYA PNDK Luggage Capacity';
    }
    getCacheType() {
        return 'plugin_nya_pndk_luggagecapacity';
    }
    getParameterTextPattern() {
        return /^(?:Attribute name|Dialog title|Dialog message)$/;
    }
}
