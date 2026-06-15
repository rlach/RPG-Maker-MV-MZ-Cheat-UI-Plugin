import { describe, expect, it } from 'vitest';
import {
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
