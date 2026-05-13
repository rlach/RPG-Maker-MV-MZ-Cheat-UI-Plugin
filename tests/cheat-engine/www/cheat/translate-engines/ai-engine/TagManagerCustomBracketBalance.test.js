import { describe, expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import { TAG_TYPE } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';

describe('TagManager custom bracket balancing', () => {
    function createTagManagerWithCustomN() {
        const tagManager = new TagManager(null);
        tagManager.setCustomTagConfigs([
            {
                description: 'custom N bracket parameter',
                type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
                tagSymbol: 'N',
                bracket: '[',
                maskValue: false,
                requiredConsistency: false,
            },
        ]);
        return tagManager;
    }

    it('does not capture malformed \\N[11 using ] from a later tag', () => {
        const tagManager = createTagManagerWithCustomN();
        const input = String.raw`\C[14]\N[1]\C[0]
「！\N[11\N[12]
…！」`;

        const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);

        // The malformed "\\N[11" must stay malformed; only valid "\\N[12]" should be encoded.
        expect(preprocessedText.includes(String.raw`\N[11[b=wa12]`)).toBe(true);
        expect(preprocessedText).not.toContain(String.raw`[b=cn[11[b=wa12]]`);

        const postResult = tagManager.postprocessTags(preprocessedText, tagCounts, caseMap);

        expect(postResult.valid).toBe(true);
        expect(postResult.text).toBe(input);
    });

    it('supports nested parameters like \\N[\\V[1]] for custom tags', () => {
        const tagManager = createTagManagerWithCustomN();
        const input = String.raw`\N[\V[1]]`;

        const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);
        const postResult = tagManager.postprocessTags(preprocessedText, tagCounts, caseMap);

        expect(postResult.valid).toBe(true);
        expect(postResult.text).toBe(input);
    });

    it('roundtrips well-formed nested custom + numeric tags', () => {
        const tagManager = createTagManagerWithCustomN();
        const input = String.raw`\N[11\N[12]]`;

        const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);
        const postResult = tagManager.postprocessTags(preprocessedText, tagCounts, caseMap);

        expect(postResult.valid).toBe(true);
        expect(postResult.text).toBe(input);
    });

    it('keeps nested encoded tags protected inside malformed custom token during unpack', () => {
        const tagManager = createTagManagerWithCustomN();
        const customNEntry = tagManager.customParameterEntries.find(
            (entry) => entry.tagSymbol === 'N' && entry.bracket === '['
        );
        const numericNEntry = tagManager.tagEntries.find(
            (entry) =>
                entry.tagSymbol === 'N' && entry.type === TAG_TYPE.WITH_NUMERIC_PARAMETER
        );

        expect(customNEntry).toBeTruthy();
        expect(numericNEntry).toBeTruthy();

        const malformedPacked = String.raw`"! [b=${customNEntry.tagId}[11[b=${numericNEntry.tagId}12]] ...!`;
        const postResult = tagManager.postprocessTags(malformedPacked, {}, {});

        expect(postResult.valid).toBe(false);
        expect(postResult.text).toContain(
            String.raw`[b=${customNEntry.tagId}[11[b=${numericNEntry.tagId}12]]`
        );
        expect(postResult.text).not.toContain(String.raw`\N[12]`);
    });
});
