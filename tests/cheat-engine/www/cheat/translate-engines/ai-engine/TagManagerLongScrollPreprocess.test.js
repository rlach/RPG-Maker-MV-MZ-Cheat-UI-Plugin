import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import { preprocessPayloadForLlm } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/utils.js';

describe('TagManager preprocess long scroll payload', () => {
    it('builds JSON payload with m0 and shortens value after preprocessing', () => {
        const sourceText = readFileSync(
            new URL('../../mocks/longScroll.mock.txt', import.meta.url),
            'utf8'
        );

        const tagManager = new TagManager(null);
        const { preprocessedText } = tagManager.preprocessTags(sourceText);

        const payload = {
            messages: [{ role: 'user', content: JSON.stringify({ m0: preprocessedText }) }],
        };
        const processedPayload = preprocessPayloadForLlm(payload);
        const processedContent = processedPayload.messages[0].content;
        const parsedPayload = JSON.parse(processedContent);

        const countSpaces = (str) => (str.match(/ /g) || []).length;
        const countWideSpaces = (str) => (str.match(/　/g) || []).length;
        expect(parsedPayload).toHaveProperty('m0');
        expect(typeof parsedPayload.m0).toBe('string');
        expect(parsedPayload.m0.length).toBeLessThan(sourceText.length);
        expect(countWideSpaces(sourceText)).to.eql(954);
        expect(countWideSpaces(parsedPayload.m0)).to.eql(14);
    });

    it('wraps and restores long runs of full-width Japanese spaces', () => {
        const sourceText = `A${'　'.repeat(8)}B`;
        const tagManager = new TagManager(null);

        const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(sourceText);
        const fullWidthSpaceEntry = tagManager.longRunEntries.find((entry) => entry.character === '　');

        expect(fullWidthSpaceEntry).toBeTruthy();
        expect(preprocessedText.includes(`[b=${fullWidthSpaceEntry.tagId}8]`)).toBe(true);

        const postprocessed = tagManager.postprocessTags(preprocessedText, tagCounts, caseMap);
        expect(postprocessed.valid).toBe(true);
        expect(postprocessed.text).toBe(sourceText);
    });
});
