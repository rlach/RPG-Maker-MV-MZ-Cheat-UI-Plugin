import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** NYA_FTKR_ItemSubCommand (MZ, installed build). Catalogs display literals and parameters; preserves logic-owned values. */
export class NyaItemSubCommandTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'NYA_FTKR_ItemSubCommand';
    }
    getPluginLabel() {
        return 'NYA FTKR Item Subcommand';
    }
    getCacheType() {
        return 'plugin_nya_ftkr_itemsubcommand';
    }
    getParameterTextPattern() {
        return / Format$/;
    }
}
