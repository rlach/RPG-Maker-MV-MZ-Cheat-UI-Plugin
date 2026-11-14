import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/**
 * NYA_PNDK_LuggageCapacity (MZ, installed build).
 * PNDK_LuggageCapacity v1.2.0 (MV): attribute label and weight unit from parameters.
 * Catalogs display text without changing weight calculations or plugin parameters.
 */
export class NyaLuggageCapacityTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'NYA_PNDK_LuggageCapacity';
    }
    getPluginAliases() {
        return [this.getPluginName(), 'PNDK_LuggageCapacity'];
    }
    getPluginLabel() {
        return 'PNDK Luggage Capacity';
    }
    getCacheType() {
        return 'plugin_nya_pndk_luggagecapacity';
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        this.hookDrawing(window.Window_Base.prototype, 'textWidth');
        return true;
    }
    getParameterTextPattern() {
        return /^(?:Attribute name|Dialog title|Dialog message|Unit)$/;
    }
}
