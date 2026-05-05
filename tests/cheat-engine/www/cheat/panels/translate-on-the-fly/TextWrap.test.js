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

const KNOWN_TAGS_WITH_RESERVED_WIDTH = [
    {
        tagSymbol: 'N',
        type: 'withNumericParameter',
        reservedWidth: 6,
    },
    {
        tagSymbol: 'C',
        type: 'withNumericParameter',
        reservedWidth: 0,
    },
    {
        tagSymbol: 'X',
        type: 'withCustomParameter',
        bracket: '[',
        bracketClose: ']',
        reservedWidth: 5,
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
            "\\AA[2]\\F1[1](I see, that's why she got lost on such a simple path.\nWhat a silly person, to make a mistake like that)"
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

    it('normalizes llm newline before punctuation-only fragments and wraps at width 52', () => {
        const llmShortPunctuation =
            '\\V[23]\n"To ensure a swift defeat, our \\V[23]Warrior unit and members of the Holy Magic Research Society for support were hastily assembled as a force\n."';
        const llmLongPunctuation =
            '\\V[23]\n"To ensure a swift defeat, our \\V[23]Warrior unit and members of the Holy Magic Research Society for support were hastily assembled as a force\n................."';
        const noLlmBreakButNeedsRewrap =
            '\\V[23]\n"To ensure a swift defeat, our \\V[23]Warrior unit and members of the Holy Magic Research Society for support were hastily assembled as a very little force\n...."';

        expect(wrapTextByVisibleWidth(llmShortPunctuation, 52)).toBe(
            '\\V[23]\n"To ensure a swift defeat, our \\V[23]Warrior unit and\nmembers of the Holy Magic Research Society for\nsupport were hastily assembled as a force."'
        );

        expect(wrapTextByVisibleWidth(llmLongPunctuation, 52)).toBe(
            '\\V[23]\n"To ensure a swift defeat, our \\V[23]Warrior unit and\nmembers of the Holy Magic Research Society for\nsupport were hastily assembled as a force\n................."'
        );

        expect(wrapTextByVisibleWidth(noLlmBreakButNeedsRewrap, 52)).toBe(
            '\\V[23]\n"To ensure a swift defeat, our \\V[23]Warrior unit and\nmembers of the Holy Magic Research Society for\nsupport were hastily assembled as a very little\nforce...."'
        );
    });

    it('applies width multiplier for text after a single \{ increase', () => {
        const input = '\\{To jest przykładowy tekst buahahahaha. Co mi teraz zrobisz?';
        const output = wrapTextByVisibleWidth(input, 60, {
            fontScaleWidthMultiplier: 0.69,
        });

        expect(output).toBe('\\{To jest przykładowy tekst buahahahaha. Co\nmi teraz zrobisz?');
    });

    it('keeps line unwrapped when \} lowers text level and effective width usage', () => {
        const input = '\\}abcd efgh ijkl';
        const output = wrapTextByVisibleWidth(input, 10, {
            fontScaleWidthMultiplier: 0.69,
        });

        expect(output).toBe('\\}abcd efgh ijkl');
    });

    it('handles nested \{ and \} levels while wrapping by weighted width', () => {
        const input = '\\{Alpha \\{Beta Gamma\\} Delta Epsilon Zeta';
        const output = wrapTextByVisibleWidth(input, 20, {
            fontScaleWidthMultiplier: 0.69,
        });

        expect(output).toBe('\\{Alpha \\{Beta\nGamma\\} Delta\nEpsilon Zeta');
    });

    it('counts reserved width for built-in numeric tags', () => {
        const input = '\\N[1]\\C[23] I like apples\\C[0]';
        const output = wrapTextByVisibleWidth(input, 19, {
            tagEntries: KNOWN_TAGS_WITH_RESERVED_WIDTH,
        });

        expect(output).toBe('\\N[1]\\C[23] I like\napples\\C[0]');
    });

    it('counts reserved width for custom parameter tags', () => {
        const input = '\\X[foo] alpha beta';
        const output = wrapTextByVisibleWidth(input, 12, {
            tagEntries: KNOWN_TAGS_WITH_RESERVED_WIDTH,
        });

        expect(output).toBe('\\X[foo] alpha\nbeta');
    });
});
