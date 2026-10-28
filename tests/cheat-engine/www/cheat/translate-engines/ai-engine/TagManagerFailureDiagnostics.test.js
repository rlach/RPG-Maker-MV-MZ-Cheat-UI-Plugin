import { expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';

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

it.each(['TAG:sn', '.TAG:sn⟫', '<<TAG:sn>', '⟪TAG:sn', 'TAG:sp12'])(
    'rejects broken known transport marker %s',
    (text) => {
        const manager = new TagManager(null);
        expect(manager.postprocessTags(text, {}, {}).valid).toBe(false);
    }
);

it.each(['TAG', 'TAG:', 'TAG:unknown', 'TAG:snow', '<< plain >>'])(
    'preserves ordinary text %s',
    (text) => {
        const manager = new TagManager(null);
        expect(manager.postprocessTags(text, {}, {}).valid).toBe(true);
    }
);
