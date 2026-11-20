import { expect, it, vi } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';

it.each([
    '<characterName:!Flame>\n<srpgClass:エネミー>\n<srpgThroughTag:1>\n//srpgThroughTagを入れると、\n　通過できます',
    '<faceName:SF_Monster>\n<srpgClass:エネミー>\n<srpgThroughTag:1>',
    '<srpgClass:生前信奉唯物主义>\n<srpgThroughTag:1>\n<DD最大HP:prev+(0*10)>',
    '<srpgClass:凑数用>\n<srpgThroughTag:1>\n<DD敏捷性:prev+(0)>',
    '<srpgThroughTag:2>\n<characterName:VXAce_Riding>\n<srpgClass:骑士先生，马娘们在追杀你啊>',
])('accepts decoded game metadata containing Tag: inside an identifier', (source) => {
    const manager = new TagManager(null);
    const { preprocessedText, tagCounts, caseMap } = manager.preprocessTags(source);
    const output = preprocessedText.replace(
        /エネミー|生前信奉唯物主义|凑数用|骑士先生，马娘们在追杀你啊/g,
        'Enemy'
    );
    const result = manager.postprocessTags(output, tagCounts, caseMap);
    expect(result.valid).toBe(true);
    expect(result.text).toContain(
        source.includes('<srpgThroughTag:2>') ? '<srpgThroughTag:2>' : '<srpgThroughTag:1>'
    );
    expect(result.text).not.toContain('⟪TAG:');
});
it.each(['TAG:sn', 'prefix TAG:missing', '<name:TAG:broken>', '⟪broken', 'broken⟫'])(
    'still rejects broken transport markup %s',
    (text) => {
        const manager = new TagManager(null);
        const { tagCounts, caseMap } = manager.preprocessTags('Text');
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const result = manager.postprocessTags(text, tagCounts, caseMap);
            expect(result.valid).toBe(false);
            expect(result.errorReason).toBe('Unresolved encoded tags left in output');
            expect(result.unresolvedTags.length).toBeGreaterThan(0);
        } finally {
            warning.mockRestore();
        }
    }
);
it('accepts the reported native tag metadata after decoding newline transport tokens', () => {
    const manager = new TagManager(null);
    const source = '<tag: buji,lianjin>\n<icon:icon-item-x-myl>\n<pic:icon-item-d-myl>\n<BD_gold: 50>\n<sell: 16>';
    const { preprocessedText, tagCounts, caseMap } = manager.preprocessTags(source);
    const output = preprocessedText.replace('buji,lianjin', 'Broken,Gold Inlay');
    const result = manager.postprocessTags(output, tagCounts, caseMap);
    expect(result.valid).toBe(true);
    expect(result.text).toBe(source.replace('buji,lianjin', 'Broken,Gold Inlay'));
    expect(result.text).not.toContain('⟪TAG:sn⟫');
});
it.each(['<tag: Broken> TAG:sn', '<tag: ⟪TAG:broken⟫>', '<<TAG:sn>', '<tag: unclosed'])('does not hide broken transport tokens near native tags: %s', text => {
    const result = new TagManager(null).postprocessTags(text, {}, {});
    expect(result.valid).toBe(false);
});
