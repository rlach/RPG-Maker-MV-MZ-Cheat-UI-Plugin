import { expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import { TAG_TYPE } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';

it('rejects the reported Bornica response because the model dropped a newline and indentation', () => {
    const manager = new TagManager(null);
    manager.setCustomTagConfigs([
        {
            description: 'Speaker name',
            tagSymbol: 'NW',
            type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
            bracket: '[',
            maskValue: false,
            requiredConsistency: true,
        },
    ]);
    const source =
        '\\nw[富豪ボルニカ]「彼女――レミィリアは、\n　なにやら錬金術師の双子を使って、\n　解読を進めようとしているようだしな」';
    const prepared = manager.preprocessTags(source);
    const output =
        '⟪TAG:sa[Wealthy Bornica]⟫"That girl—Remyllia—it seems she is trying to proceed with the decoding⟪TAG:sn⟫⟪TAG:sw1⟫using some kind of alchemist twins.」';
    expect(prepared.preprocessedText.match(/⟪TAG:sn⟫/g)).toHaveLength(2);
    expect(prepared.preprocessedText.match(/⟪TAG:sw1⟫/g)).toHaveLength(2);
    const result = manager.postprocessTags(output, prepared.tagCounts, prepared.caseMap);
    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('Tag count mismatch');
    expect(result.text).toContain('Wealthy Bornica');
    expect(
        manager.postprocessTags(prepared.preprocessedText, prepared.tagCounts, prepared.caseMap)
            .valid
    ).toBe(true);
});

it('identifies each unresolved occurrence including repeated and unclosed tags', () => {
    const manager = new TagManager(null);
    const text = 'First ⟪TAG:unknown⟫ second ⟪TAG:unknown⟫ tail ⟪TAG:broken';
    const result = manager.postprocessTags(text, {}, {});
    expect(result.valid).toBe(false);
    expect(result.unresolvedTags.map(({ tag, index }) => ({ tag, index }))).toEqual([
        { tag: '⟪TAG:unknown⟫', index: 6 },
        { tag: '⟪TAG:unknown⟫', index: 27 },
        { tag: '⟪TAG:broken', index: 46 },
    ]);
    for (const entry of result.unresolvedTags) {
        expect(result.text.slice(entry.index, entry.index + entry.tag.length)).toBe(entry.tag);
        expect(entry.context).toContain(entry.tag);
    }
});

it.each([
    'TAG:sn',
    '.TAG:sn⟫',
    '<<TAG:sn>',
    '⟪TAG:sn',
    'TAG:sp12',
    'TAG:',
    'TAG:unknown',
    'TAG:snow',
])('rejects broken transport fragments %s', (text) => {
    const manager = new TagManager(null);
    expect(manager.postprocessTags(text, {}, {}).valid).toBe(false);
});

it.each(['TAG', '<< plain >>'])('preserves ordinary text %s', (text) => {
    const manager = new TagManager(null);
    expect(manager.postprocessTags(text, {}, {}).valid).toBe(true);
});
