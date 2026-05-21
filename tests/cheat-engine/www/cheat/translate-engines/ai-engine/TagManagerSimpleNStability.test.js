import { describe, expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import { TAG_TYPE } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';

describe('TagManager simpleN stability', () => {
    it('keeps newline tag id fixed as sn even when another tag prefers sn', () => {
        const tagManager = new TagManager(null);

        tagManager.setCustomTagConfigs([
            {
                description: 'sn conflict tag',
                type: TAG_TYPE.WITHOUT_PARAMETER,
                tagSymbol: 'ZZ',
                requiredConsistency: true,
            },
        ]);

        expect(tagManager.simpleNEntry.tagId).toBe('sn');

        const conflictEntry = tagManager.tagEntries.find((entry) => entry.tagSymbol === 'ZZ');
        expect(conflictEntry).toBeTruthy();
        expect(conflictEntry.tagId).not.toBe('sn');
    });

    it('processes [b=sn] from llm output into a real newline', () => {
        const tagManager = new TagManager(null);
        tagManager.setCustomTagConfigs([
            {
                description: 'sn conflict tag',
                type: TAG_TYPE.WITHOUT_PARAMETER,
                tagSymbol: 'ZZ',
                requiredConsistency: true,
            },
        ]);

        const { tagCounts, caseMap } = tagManager.preprocessTags('Original line');
        const post = tagManager.postprocessTags('Strike[b=sn]again', tagCounts, caseMap);

        expect(post.valid).toBe(true);
        expect(post.text).toBe('Strike\nagain');
    });
});
