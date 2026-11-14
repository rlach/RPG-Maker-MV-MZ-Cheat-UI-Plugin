import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** RebirthPowerCommand (MZ). Display vocabulary and source templates; gameplay values stay intact. */
export class RebirthPowerCommandTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'RebirthPowerCommand';
    }
    getCacheType() {
        return 'plugin_rebirthpowercommand';
    }
    getParameterTextPattern() {
        return /^(?:commandName|restrictNoticeText|noticeText)$/;
    }
    isDisplayFragment() {
        return false;
    }
}
