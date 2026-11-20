import { VisuMenuCatalogTranslator } from '../VisuMenuCatalogTranslator.js';

export class VisuOptionsCoreTranslator extends VisuMenuCatalogTranslator {
    getPluginName() {
        return 'VisuMZ_1_OptionsCore';
    }
    getCacheType() {
        return 'plugin_visu_options_core';
    }
    getWindowNames() {
        return ['Window_Options', 'Window_OptionsCategory'];
    }
    isDisplayField(field, path) {
        return (
            field === 'TextStr:str' ||
            field === 'buttonAssistCategory:str' ||
            (field === 'Name:str' && path.includes('Categories:arraystruct'))
        );
    }
}
