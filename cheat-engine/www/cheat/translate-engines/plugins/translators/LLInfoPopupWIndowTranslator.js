import { TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

const PLUGIN_TAGS = [
    {
        description: 'Change font size',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'FS',
        requiredConsistency: true,
    },
];

export class LLInfoPopupWIndowTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'LL_InfoPopupWIndow';
    }

    getPluginLabel() {
        return 'LL Info Popup Window';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(PLUGIN_TAGS);
        return true;
    }
}
