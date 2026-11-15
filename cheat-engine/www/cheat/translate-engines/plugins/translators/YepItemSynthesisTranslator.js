import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** YEP_ItemSynthesis (MV). Display labels and vocabulary only; crafting/save behavior is unchanged. */
export class YepItemSynthesisTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'YEP_ItemSynthesis';
    }
    getCacheType() {
        return 'plugin_yep_itemsynthesis';
    }
    getParameterTextPattern() {
        return /^(?:(?:Synthesis|Item|Weapon|Armor|Finish) Command|Collected Recipes|Crafted (?:Items|Weapons|Armors)|Mask Help Text|Ingredients Text|Amount Text)$/;
    }
    isDisplayFragment() {
        return false;
    }
}
