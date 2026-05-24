// Registers LL_StandingPicture control-character tags with the translation engine
// so their command prefixes and bracketed values remain protected during translation.

import { TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

const createTagWithoutParam = (description, tagSymbol) => ({
    description,
    type: TAG_TYPE.WITHOUT_PARAMETER,
    tagSymbol,
    requiredConsistency: true,
});

const PLUGIN_TAGS = [
    createTagWithoutParam('Centers the message', 'AC'),
    createTagWithoutParam('Right aligns the message', 'AR'),
    createTagWithoutParam('Aligns the message vertically to center', 'VC'),
    createTagWithoutParam('Aligns the message vertically to bottom', 'VB'),
    {
        description:
            'Centers the message and shifts it to the left by the specified number of characters',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'AC',
        requiredConsistency: true,
    },
];

export class MessageAlignCenterTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MessageAlignCenter';
    }

    getPluginLabel() {
        return 'Message Align Center';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(PLUGIN_TAGS);
        return true;
    }
}
