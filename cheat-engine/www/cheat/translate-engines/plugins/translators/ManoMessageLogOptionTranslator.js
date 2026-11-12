import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** ManoUZ_MessageLogOption (MZ, installed build). Catalogs display literals and parameters; preserves logic-owned values. */
export class ManoMessageLogOptionTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'ManoUZ_MessageLogOption';
    }
    getPluginLabel() {
        return 'ManoUZ Message Log Option';
    }
    getCacheType() {
        return 'plugin_manouz_messagelogoption';
    }
    getParameterTextPattern() {
        return /^(?:optionText|textON|textOFF|keepAutoMode|machinakaMode)$/;
    }
}
