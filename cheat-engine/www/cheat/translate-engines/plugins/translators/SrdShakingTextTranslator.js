import { BasePluginTranslator } from '../BasePluginTranslator.js';

export class SrdShakingTextTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'SRD_ShakingText';
    }
    enablePluginTranslation() {
        this.registerPluginCustomTags([
            {
                tagSymbol: 'SHAKE',
                description:
                    'SRD_ShakingText: Shake subsequent characters; optional speed and maximum x/y displacement parameters.',
                style: 'escape',
                type: 'withoutParameter',
                bracket: 'none',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'SHAKE',
                description:
                    'SRD_ShakingText: Shake subsequent characters; optional speed and maximum x/y displacement parameters.',
                style: 'escape',
                type: 'withCustomParameter',
                bracket: '<',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'SHAKE',
                description:
                    'SRD_ShakingText: authored bracketed motion control; preserve arguments unchanged.',
                style: 'escape',
                type: 'withCustomParameter',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'WAVE',
                description:
                    'SRD_ShakingText: Animate subsequent characters vertically; optional speed and maximum displacement.',
                style: 'escape',
                type: 'withoutParameter',
                bracket: 'none',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'WAVE',
                description:
                    'SRD_ShakingText: Animate subsequent characters vertically; optional speed and maximum displacement.',
                style: 'escape',
                type: 'withCustomParameter',
                bracket: '<',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'WAVE',
                description:
                    'SRD_ShakingText: authored bracketed motion control; preserve arguments unchanged.',
                style: 'escape',
                type: 'withCustomParameter',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'SLIDE',
                description:
                    'SRD_ShakingText: Animate subsequent characters horizontally; optional speed and maximum displacement.',
                style: 'escape',
                type: 'withoutParameter',
                bracket: 'none',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'SLIDE',
                description:
                    'SRD_ShakingText: Animate subsequent characters horizontally; optional speed and maximum displacement.',
                style: 'escape',
                type: 'withCustomParameter',
                bracket: '<',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'SLIDE',
                description:
                    'SRD_ShakingText: authored bracketed motion control; preserve arguments unchanged.',
                style: 'escape',
                type: 'withCustomParameter',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'CIRCLE',
                description: 'SRD_ShakingText: Animate subsequent characters in a circle.',
                style: 'escape',
                type: 'withoutParameter',
                bracket: 'none',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'RESETSHAKE',
                description: 'SRD_ShakingText: Reset character motion to normal.',
                style: 'escape',
                type: 'withoutParameter',
                bracket: 'none',
                maskValue: true,
                requiredConsistency: true,
                reservedWidth: 0,
                extraPrompt:
                    'Preserve this presentation control and all its parameters exactly. Keep it in its original position; do not translate its parameters.',
            },
            {
                tagSymbol: 'RESETSHAKE',
                description:
                    'SRD_ShakingText: authored bracketed motion control; preserve arguments unchanged.',
                style: 'escape',
                type: 'withCustomParameter',
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
