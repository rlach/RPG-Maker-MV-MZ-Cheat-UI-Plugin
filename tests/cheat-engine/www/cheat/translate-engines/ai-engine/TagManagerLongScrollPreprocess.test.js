import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import { preprocessPayloadForLlm } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/utils.js';

describe('TagManager preprocess long scroll payload', () => {
    it('protects four full-width indentation spaces on each line before sending to the LLM', () => {
        const manager = new TagManager(null);
        const source = '　　　　「薬草の丘」で薬草を5個拾う\n　　　　次の目的';
        const prepared = manager.preprocessTags(source);
        expect(prepared.preprocessedText).not.toContain('　');
        const translated = prepared.preprocessedText
            .replace('「薬草の丘」で薬草を5個拾う', 'Pick up 5 Herbs')
            .replace('次の目的', 'Next objective');
        const restored = manager.postprocessTags(translated, prepared.tagCounts, prepared.caseMap);
        expect(restored.valid).toBe(true);
        expect(restored.text).toBe('　　　　Pick up 5 Herbs\n　　　　Next objective');
        const missingIndentation = translated.replace(/^.*?⟫/, '');
        expect(
            manager.postprocessTags(missingIndentation, prepared.tagCounts, prepared.caseMap).valid
        ).toBe(false);
    });
    it('builds JSON payload with m0 and compresses long whitespace runs', () => {
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
        const uncompressedManager = new TagManager(null);
        uncompressedManager.longRunEntries = [];
        const uncompressed = uncompressedManager.preprocessTags(sourceText).preprocessedText;
        expect(parsedPayload.m0.length).toBeLessThan(uncompressed.length);
        expect(countWideSpaces(sourceText)).to.eql(954);
        expect(countWideSpaces(parsedPayload.m0)).to.eql(14);
    });

    it('wraps and restores long runs of full-width Japanese spaces', () => {
        const sourceText = `A${'　'.repeat(8)}B`;
        const tagManager = new TagManager(null);

        const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(sourceText);
        const fullWidthSpaceEntry = tagManager.longRunEntries.find(
            (entry) => entry.character === '　'
        );

        expect(fullWidthSpaceEntry).toBeTruthy();
        expect(preprocessedText.includes(`⟪TAG:${fullWidthSpaceEntry.tagId}8⟫`)).toBe(true);

        const postprocessed = tagManager.postprocessTags(preprocessedText, tagCounts, caseMap);
        expect(postprocessed.valid).toBe(true);
        expect(postprocessed.text).toBe(sourceText);
    });
});
