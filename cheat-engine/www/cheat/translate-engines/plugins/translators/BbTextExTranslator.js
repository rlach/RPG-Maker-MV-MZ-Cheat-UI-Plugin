import { BasePluginTranslator } from '../BasePluginTranslator.js';

export class BbTextExTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'BB_TextEX';
    }
    enablePluginTranslation() {
        this.registerPluginCustomTags([
            {
                tagSymbol: 'L',
                description: 'BB_TextEX: text outline width in pixels.',
                style: 'escape',
                type: 'withNumericParameter',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'R',
                description:
                    'BB_TextEX: outline color palette index; values above 31 restore the default.',
                style: 'escape',
                type: 'withNumericParameter',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'O',
                description:
                    'BB_TextEX: text opacity; zero selects translucent, positive values restore normal opacity.',
                style: 'escape',
                type: 'withNumericParameter',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
        ]);
        return true;
    }
}
