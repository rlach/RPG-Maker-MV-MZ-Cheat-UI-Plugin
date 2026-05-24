import { TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

const PLUGIN_TAGS = [
    {
        description: 'Plays selected sound effect with char (SE 1 or 2) or disables it (SE 0)',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'SE',
        requiredConsistency: true,
    },
];

export class PlayMsgWndCharSeMZTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'PlayMsgWndCharSeMZ';
    }

    getPluginLabel() {
        return 'Play Msg Wnd Char Se MZ';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(PLUGIN_TAGS);
        return true;
    }
}
