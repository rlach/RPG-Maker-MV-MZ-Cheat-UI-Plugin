import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** SRPG_BattlePrepare_MZ. Deployment commands and participant-count caption. */
export class SrpgBattlePrepareTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'SRPG_BattlePrepare_MZ';
    }
    getCacheType() {
        return 'plugin_srpg_battle_prepare';
    }
    getParameterTextPattern() {
        return /^text\w+$/;
    }
    isDisplayFragment() {
        return false;
    }
}
