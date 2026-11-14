import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** STV_BeastBook (MV installed version): display labels in parameters and source literals. */
export class StvBeastBookTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'STV_BeastBook';
    }
    getPluginLabel() {
        return 'STV Beast Book';
    }
    getCacheType() {
        return 'plugin_stv_beast_book';
    }
    getParameterTextPattern() {
        return /(?:Text|Data)$/;
    }
}
