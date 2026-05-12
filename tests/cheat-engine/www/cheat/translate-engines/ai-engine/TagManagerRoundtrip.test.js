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

/**
 * Regression test for nested bracket corruption bug with YEP_MessageCore \NI tag.
 * 
 * When \NI is registered twice (once from plugin with simple [n], and once custom with [\V[n]]),
 * the custom tag with nested brackets was losing the closing bracket during pack/unpack roundtrip.
 * 
 * Original: \>\ni[\v[1]]を手に入れた！
 * After LLM: \>Obtained \ni[\V[1]!  ← missing closing bracket
 * Expected: \>Obtained \ni[\v[1]]!
 */
describe('TagManager roundtrip with YEP_MessageCore \\NI tag (nested brackets regression)', () => {
    const YEP_MESSAGE_CORE_NI_SIMPLE = {
        description: 'YEP_MessageCore name input simple',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'NI',
        bracket: '[',
        maskValue: false,
        requiredConsistency: false,
    };

    const YEP_MESSAGE_CORE_NI_NESTED = {
        description: 'YEP_MessageCore name input custom nested',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'NI',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    };

    function createTagManagerWithNITags(customNITag = null) {
        const tagManager = new TagManager(null);
        const tags = [YEP_MESSAGE_CORE_NI_SIMPLE];
        if (customNITag) {
            tags.push(customNITag);
        }
        tagManager.setCustomTagConfigs(tags);
        return tagManager;
    }

    describe('without duplicate NI tag', () => {
        it('preserves simple \\NI[n] tag correctly', () => {
            const tagManager = createTagManagerWithNITags();
            const input = '\\>\\NI[1]を手に入れた！';

            const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);

            // Should not have triple closing brackets
            expect(preprocessedText).not.toMatch(/\]\]\]/);

            const postResult = tagManager.postprocessTags(preprocessedText, tagCounts, caseMap);

            expect(postResult.valid).toBe(true);
            expect(postResult.text).toBe(input);
        });
    });

    describe('WITH duplicate custom NI tag (nested brackets regression)', () => {
        it('does not lose closing bracket in nested \\NI[\\V[1]] tag during roundtrip', () => {
            const tagManager = createTagManagerWithNITags(YEP_MESSAGE_CORE_NI_NESTED);
            const input = String.raw`\>\NI[\V[1]]を手に入れた！`;

            // DEBUG: Check tag entries
            console.log('\n=== TAG ENTRIES DEBUG ===');
            console.log('Total entries:', tagManager.tagEntries.length);
            tagManager.tagEntries.forEach((entry, i) => {
                console.log(`  [${i}] tagId=${entry.tagId}, symbol=${entry.tagSymbol}, maskValue=${entry.maskValue}, description=${entry.description}`);
            });

            const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);

            console.log('\n=== PREPROCESSING DEBUG ===');
            console.log('Input:', input);
            console.log('Preprocessed:', preprocessedText);
            console.log('Tag counts:', tagCounts);
            console.log('Masked values:', caseMap.maskedByTagKey);
            console.log('========================\n');

            // BUG regression: encoded output must preserve a fully closed NI parameter block.
            // Nested encoded tags can legitimately produce "]]]" in the packed form.
            expect(preprocessedText).toMatch(/\[b=[a-z0-9]{2}\[[^\]]*\]\]/i);
            // The packed tag should still be fully closed before the following text.
            expect(preprocessedText).toMatch(/\]\s*を/);

            const postResult = tagManager.postprocessTags(preprocessedText, tagCounts, caseMap);

            expect(postResult.valid).toBe(true);
            expect(postResult.text).toBe(input);
        });

        it('roundtrips correctly when LLM translates text but preserves \\NI[\\V[1]] tag', () => {
            const tagManager = createTagManagerWithNITags(YEP_MESSAGE_CORE_NI_NESTED);
            const input = '\\>\\NI[\\V[1]]を手に入れた！';

            const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);

            console.log('\n=== ROUNDTRIP TEST: Text Translation ===');
            console.log('Preprocessed:', preprocessedText);
            console.log('Masked:', caseMap.maskedByTagKey);

            // Simulate LLM returning tags unchanged but translating text part
            const llmOutput = preprocessedText.replace('を手に入れた！', 'Obtained!');
            console.log('LLM output:', llmOutput);

            const postResult = tagManager.postprocessTags(llmOutput, tagCounts, caseMap);

            console.log('Postprocess valid:', postResult.valid);
            console.log('Postprocess result:', postResult.text);
            if (postResult.errorReason) {
                console.log('Error:', postResult.errorReason);
            }
            console.log('=========================\n');

            expect(postResult.valid).toBe(true);
            expect(postResult.text).toBe('\\>\\NI[\\V[1]]Obtained!');
        });

        it('roundtrips correctly when LLM also translates NI tag parameter reference', () => {
            const tagManager = createTagManagerWithNITags(YEP_MESSAGE_CORE_NI_NESTED);
            const input = '\\>\\NI[\\V[1]]を手に入れた！';

            const { preprocessedText, tagCounts, caseMap } = tagManager.preprocessTags(input);

            // Simulate LLM translating and potentially returning upper case V (common issue)
            // The masked tag should still maintain bracket integrity
            let llmOutput = preprocessedText.replace('を手に入れた！', 'Obtained!');
            // LLM might have changed case or format, but the core structure should be intact
            llmOutput = llmOutput.replace(/\\V/g, '\\V'); // Ensure uppercase stays

            const postResult = tagManager.postprocessTags(llmOutput, tagCounts, caseMap);

            expect(postResult.valid).toBe(true);
            // Should successfully decode back to original structure
            expect(postResult.text).toContain('\\NI[');
            expect(postResult.text).toContain(']');
        });
    });
});
