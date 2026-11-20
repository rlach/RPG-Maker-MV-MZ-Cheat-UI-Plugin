import { ParameterLabelTranslator } from '../ParameterLabelTranslator.js';

export class NoEquipmentTextTranslator extends ParameterLabelTranslator {
    getPluginName() {
        return 'NoEquipmentText';
    }
    getCacheType() {
        return 'plugin_no_equipment_text';
    }
    getTextFields() {
        return ['text'];
    }
}
