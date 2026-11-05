import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { TAG_TYPE } from '../../ai-engine/constants.js';

/** Triacontane MessageCommon executes a common event from message text. */
export class MessageCommonTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MessageCommon';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags([
            {
                description: 'Execute the numbered common event during message display.',
                type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
                tagSymbol: 'CE',
                requiredConsistency: true,
                extraPromptForLlm: 'Preserve the event number and its position in the message.',
            },
        ]);
        return true;
    }
}
