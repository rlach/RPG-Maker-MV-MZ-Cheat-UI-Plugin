import { describe, expect, it } from 'vitest';
import UnknownTagsModal, {
    findTagExamples,
    filterUnknownTagsListByStyle,
    getUnknownTagsCacheStringCount,
} from '../../../../../../cheat-engine/www/cheat/panels/translate-tag-manager/UnknownTagsModal.js';

describe('UnknownTagsModal utilities', () => {
    it('filters only escape-style patterns', () => {
        const rows = [
            { pattern: String.raw`\N[…]`, count: 3 },
            { pattern: '<Foo:N>', count: 2 },
            { pattern: String.raw`\ABC`, count: 1 },
        ];

        const filtered = filterUnknownTagsListByStyle(rows, 'escape');
        expect(filtered).toEqual([
            { pattern: String.raw`\N[…]`, count: 3 },
            { pattern: String.raw`\ABC`, count: 1 },
        ]);
    });

    it('filters only xml-style patterns', () => {
        const rows = [
            { pattern: String.raw`\N[…]`, count: 3 },
            { pattern: '<Foo:N>', count: 2 },
            { pattern: '<Bar:…>', count: 1 },
        ];

        const filtered = filterUnknownTagsListByStyle(rows, 'xml');
        expect(filtered).toEqual([
            { pattern: '<Foo:N>', count: 2 },
            { pattern: '<Bar:…>', count: 1 },
        ]);
    });

    it('keeps all rows for both filter', () => {
        const rows = [
            { pattern: String.raw`\N[…]`, count: 3 },
            { pattern: '<Foo:N>', count: 2 },
        ];

        const filtered = filterUnknownTagsListByStyle(rows, 'both');
        expect(filtered).toEqual(rows);
    });

    it('counts only string cache keys', () => {
        const cache = new Map([
            ['message:ja-en-hello', 'hi'],
            ['speaker:ja-en-hero', 'Hero'],
            [123, 'skip'],
        ]);

        expect(getUnknownTagsCacheStringCount(cache)).toBe(2);
    });
});

it('highlights full tag occurrences without confusing symbols, numeric parameters or text markup', () => {
    const cache = new Map([
        ['message:ja-en-Before \\CE[12] after <unsafe>', ''],
        ['message:ja-en-Other \\CE[99]', ''],
        ['message:ja-en-Not \\CEE[12]', ''],
    ]);
    const examples = findTagExamples(cache, String.raw`\CE[N]`);
    expect(examples).toHaveLength(2);
    expect(examples[0].map((p) => p.text).join('')).toBe('Before \\CE[12] after <unsafe>');
    expect(examples[0].filter((p) => p.highlighted).map((p) => p.text)).toEqual(['\\CE[12]']);
    expect(
        findTagExamples(new Map([['<N> <Name:12>', '']]), '<N>')[0]
            .filter((p) => p.highlighted)
            .map((p) => p.text)
    ).toEqual(['<N>']);
    expect(findTagExamples(new Map([['\u001bCE[12]', '']]), String.raw`\CE[N]`)).toHaveLength(1);
});

it('closes the list before opening examples and restores it after closing', () => {
    const events = [];
    const ticks = [];
    const context = {
        ...UnknownTagsModal.data(),
        runtime: {
            translationCache: new Map([
                ['first \\CE[1]', ''],
                ['second \\CE[2]', ''],
            ]),
        },
        $emit: (...args) => events.push(args),
        $nextTick: (callback) => ticks.push(callback),
    };
    context.recycleExample = () => UnknownTagsModal.methods.recycleExample.call(context);
    UnknownTagsModal.methods.showExamples.call(context, { pattern: String.raw`\CE[N]` });
    expect(events).toEqual([['update:visible', false]]);
    expect(context.exampleOpen).toBe(false);
    ticks.shift()();
    expect(context.exampleOpen).toBe(true);
    const previous = context.exampleIndex;
    context.recycleExample();
    expect(context.exampleIndex).not.toBe(previous);
    UnknownTagsModal.methods.closeExample.call(context, false);
    expect(context.exampleOpen).toBe(false);
    ticks.shift()();
    expect(events.at(-1)).toEqual(['update:visible', true]);
});
