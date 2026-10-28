import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { TAG_BRACKET, TAG_TYPE } from '../../ai-engine/constants.js';

/** Yana CombineCharacterEC 1.00 (MV): text decorations contain visible text. */
export class CombineCharacterECTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'CombineCharacterEC';
    }
    enablePluginTranslation() {
        this.registerPluginCustomTags(
            ['VS', 'PS', 'EC', 'AT', 'WAT', 'UL'].map((tagSymbol) => ({
                tagSymbol,
                description: 'CombineCharacterEC decorated display text',
                type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
                bracket: TAG_BRACKET.SQUARE,
                maskValue: false,
                alwaysTranslate: true,
                requiredConsistency: true,
            }))
        );
        return true;
    }
}
