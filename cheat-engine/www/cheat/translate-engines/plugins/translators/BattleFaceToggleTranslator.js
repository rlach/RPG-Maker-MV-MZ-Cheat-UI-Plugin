import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** BattleFaceToggle (MZ). Display vocabulary and source templates; gameplay values stay intact. */
export class BattleFaceToggleTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'BattleFaceToggle';
    }
    getCacheType() {
        return 'plugin_battlefacetoggle';
    }
    getParameterTextPattern() {
        return /^HintText\w*$/;
    }
    isDisplayFragment() {
        return false;
    }
}
