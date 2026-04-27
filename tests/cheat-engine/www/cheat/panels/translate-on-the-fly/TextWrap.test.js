import { describe, expect, it } from 'vitest';
import { wrapTextByVisibleWidth } from '../../../../../../cheat-engine/www/cheat/panels/translate-on-the-fly/TextWrap.js';

const KNOWN_BACKSLASH_TAGS = [
    {
        tagSymbol: 'AA',
        type: 'withCustomParameter',
        bracket: '[',
        bracketClose: ']',
    },
    {
        tagSymbol: 'F1',
        type: 'withCustomParameter',
        bracket: '[',
        bracketClose: ']',
    },
    {
        tagSymbol: 'F',
        type: 'withCustomParameter',
        bracket: '[',
        bracketClose: ']',
    },
];

describe('wrapTextByVisibleWidth', () => {
    it('does not split when visible width is within limit and known backslash tags are zero-width', () => {
        const input = "\\AA[2]\\F1[1](I see, that's why she got lost on such a simple path)";

        const output = wrapTextByVisibleWidth(input, 60, {
            tagEntries: KNOWN_BACKSLASH_TAGS,
        });

        expect(output).toBe(input);
    });

    it('splits when visible width exceeds limit while still treating known tags as zero-width', () => {
        const input =
            "\\AA[2]\\F1[1](I see, that's why she got lost on such a simple path. What a silly person, to make a mistake like that)";

        const output = wrapTextByVisibleWidth(input, 60, {
            tagEntries: KNOWN_BACKSLASH_TAGS,
        });

        expect(output).toBe(
            "\\AA[2]\\F1[1](I see, that's why she got lost on such a simple path. What\na silly person, to make a mistake like that)"
        );
    });

    it('never leaves leading spaces at start of wrapped lines', () => {
        const output = wrapTextByVisibleWidth('word1 word2 word3 word4', 11);
        const lines = output.split('\n');

        lines.forEach((line) => {
            expect(line.startsWith(' ')).toBe(false);
        });
        expect(lines).toEqual(['word1 word2', 'word3 word4']);
    });

    it('uses fallback regex when no known tag entries are passed', () => {
        const input = '\\AA[2]\\F1[1]hello world here';
        const output = wrapTextByVisibleWidth(input, 12);

        expect(output).toBe('\\AA[2]\\F1[1]hello\nworld here');
    });

    it('flattens existing newlines for description-like wrapping mode', () => {
        const input = 'alpha\n\n beta   gamma';
        const output = wrapTextByVisibleWidth(input, 11, {
            flattenExistingNewlines: true,
        });

        expect(output).toBe('alpha beta\ngamma');
    });

    it('keeps punctuation-like follow-up tokens attached to previous word', () => {
        const input = 'Alpha Beta , Gamma';
        const output = wrapTextByVisibleWidth(input, 12);

        expect(output).toBe('Alpha Beta ,\nGamma');
    });
});
