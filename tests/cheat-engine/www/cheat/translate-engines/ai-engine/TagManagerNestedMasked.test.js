import { expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';

it.each(['tags', 'legacy'])(
    'restores nested masked icon placeholders and their consistency counts (%s)',
    (format) => {
        const manager = new TagManager(null);
        manager.setTagFormat(format);
        manager.setCustomTagConfigs([
            {
                description: 'Dynamic value',
                tagSymbol: 'COT',
                type: 'withCustomParameter',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
            },
            {
                description: 'Icon',
                tagSymbol: 'I',
                type: 'withCustomParameter',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
            },
        ]);
        const original = '\\I[\\COT[0]]\\COT[1]\\COT[2]手に入れた！';
        const { preprocessedText, tagCounts, caseMap } = manager.preprocessTags(original);
        const translated = preprocessedText.replace('手に入れた！', '!');
        const result = manager.postprocessTags('Obtained ' + translated, tagCounts, caseMap);
        expect(result.valid).toBe(true);
        expect(result.text).toBe('Obtained \\I[\\COT[0]]\\COT[1]\\COT[2]!');
    }
);
