import { TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

const createTagWithoutParam = (description, tagSymbol) => ({
    description,
    type: TAG_TYPE.WITHOUT_PARAMETER,
    tagSymbol,
    requiredConsistency: true,
});

const ALIGNMENT_POSITION_PROMPT =
    'Keep this at as close to exact spot as it was in original text. If it was at the start of the string keep it at the start. This is not part of grammar, but part of presentation.';

const PLUGIN_TAGS = [
    {
        ...createTagWithoutParam('Centers the message', 'AC'),
        extraPromptForLlm: ALIGNMENT_POSITION_PROMPT,
    },
    createTagWithoutParam('Right aligns the message', 'AR'),
    createTagWithoutParam('Aligns the message vertically to center', 'VC'),
    createTagWithoutParam('Aligns the message vertically to bottom', 'VB'),
    {
        description:
            'Centers the message and shifts it to the left by the specified number of characters',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'AC',
        requiredConsistency: true,
        extraPromptForLlm: ALIGNMENT_POSITION_PROMPT,
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
