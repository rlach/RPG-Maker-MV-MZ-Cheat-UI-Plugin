import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** AutoSaveSlot (MV). Display labels and vocabulary only; crafting/save behavior is unchanged. */
export class AutoSaveSlotTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'AutoSaveSlot';
    }
    getCacheType() {
        return 'plugin_autosaveslot';
    }
    getParameterTextPattern() {
        return /^$/;
    }
    isDisplayFragment() {
        return false;
    }
}
