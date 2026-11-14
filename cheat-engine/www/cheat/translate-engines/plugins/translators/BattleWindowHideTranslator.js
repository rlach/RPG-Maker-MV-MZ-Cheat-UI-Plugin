import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** BattleWindowHide (MZ). Display vocabulary and source templates; gameplay values stay intact. */
export class BattleWindowHideTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'BattleWindowHide';
    }
    getCacheType() {
        return 'plugin_battlewindowhide';
    }
    getParameterTextPattern() {
        return /^HintText(?:Normal|Hidden)$/;
    }
    isDisplayFragment() {
        return false;
    }
}
