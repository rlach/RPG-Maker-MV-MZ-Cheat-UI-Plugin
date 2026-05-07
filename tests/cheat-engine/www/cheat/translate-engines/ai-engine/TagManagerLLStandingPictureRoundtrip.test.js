import { describe, expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import { TAG_TYPE } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';

/**
 * Reproduces the bug where a user adds a duplicate custom tag (same tagSymbol + type + bracket)
 * that already exists from a plugin. The second entry's regex re-matches the encoded output of
 * the first, corrupting the encoded text and making roundtrip decompression fail.
 */
describe('TagManager roundtrip with LL_StandingPicture plugin tags', () => {
    const LL_STANDING_PICTURE_PLUGIN_TAGS = [
        {
            description: 'LL StandingPicture show slot 1',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'F',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'LL StandingPicture show slot 2',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'FF',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'LL StandingPicture show slot 3',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'FFF',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'LL StandingPicture show slot 4',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'FFFF',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'LL StandingPicture motion slot 1',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'M',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'LL StandingPicture motion slot 2',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'MM',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'LL StandingPicture motion slot 3',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'MMM',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'LL StandingPicture motion slot 4',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'MMMM',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'LL StandingPicture focus control',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'AA',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'LL StandingPicture hold control',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            tagSymbol: 'FH',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
    ];

    function createTagManagerWithPluginAndUserTags(userCustomTags = []) {
        const tagManager = new TagManager(null);
        tagManager.setCustomTagConfigs([...LL_STANDING_PICTURE_PLUGIN_TAGS, ...userCustomTags]);
        return tagManager;
    }

    describe('roundtrip without duplicate user tag', () => {
        it('preprocesses and postprocesses \\FF\\FF[value]\\F[value]\\AA[value] correctly', () => {
            const tagManager = createTagManagerWithPluginAndUserTags();
            const input = 'ほう、領民はおらんのか。\n\\FF\\FF[nin_base]\\F[maou_base]\\AA[F]';

            const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);

            // The bare \FF (without bracket) should survive preprocessing
            // The encoded tags should not contain triple brackets
            expect(preprocessedText).not.toMatch(/\]\]\]/);

            const postResult = tagManager.postprocessTags(preprocessedText, tagCounts, caseMap);

            expect(postResult.valid).toBe(true);
            expect(postResult.text).toBe(input);
        });
    });

    describe('roundtrip WITH duplicate user tag (regression)', () => {
        it('does not corrupt encoded output when user adds duplicate \\FF[...] tag', () => {
            const duplicateUserTag = {
                description: 'ff',
                type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
                tagSymbol: 'FF',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
            };

            const tagManager = createTagManagerWithPluginAndUserTags([duplicateUserTag]);
            const input = 'ほう、領民はおらんのか。\n\\FF\\FF[nin_base]\\F[maou_base]\\AA[F]';

            const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);

            // BUG: with duplicate tag, encoded output gets corrupted with triple brackets
            expect(preprocessedText).not.toMatch(/\]\]\]/);

            const postResult = tagManager.postprocessTags(preprocessedText, tagCounts, caseMap);

            expect(postResult.valid).toBe(true);
            expect(postResult.text).toBe(input);
        });

        it('roundtrips correctly when LLM returns tags unchanged', () => {
            const duplicateUserTag = {
                description: 'ff',
                type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
                tagSymbol: 'FF',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
            };

            const tagManager = createTagManagerWithPluginAndUserTags([duplicateUserTag]);
            const input = 'ほう、領民はおらんのか。\n\\FF\\FF[nin_base]\\F[maou_base]\\AA[F]';

            const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);

            // Simulate LLM returning tags unchanged (only translating text part)
            const llmOutput = preprocessedText.replace(
                'ほう、領民はおらんのか。',
                'Ho, so there are no subjects here.'
            );

            const postResult = tagManager.postprocessTags(llmOutput, tagCounts, caseMap);

            expect(postResult.valid).toBe(true);
            expect(postResult.text).toBe(
                'Ho, so there are no subjects here.\n\\FF\\FF[nin_base]\\F[maou_base]\\AA[F]'
            );
        });
    });
});
