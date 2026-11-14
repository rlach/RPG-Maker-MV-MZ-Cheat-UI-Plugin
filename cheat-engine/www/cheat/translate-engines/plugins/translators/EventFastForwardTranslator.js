import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** EventFastForward (MZ). Display vocabulary and source templates; gameplay values stay intact. */
export class EventFastForwardTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'EventFastForward';
    }
    getCacheType() {
        return 'plugin_eventfastforward';
    }
    getParameterTextPattern() {
        return /^(?:hintText)$/;
    }
    isDisplayFragment() {
        return false;
    }
}
