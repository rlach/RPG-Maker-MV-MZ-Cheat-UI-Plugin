import { describe, expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import { TAG_TYPE } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';

/**
 * Reproduces the unknown tag detector bug where:
 * 1. \FF[...] is already registered (from LL_StandingPicture plugin)
 * 2. Text contains \FF\FF[nin_base] (bare \FF followed by \FF[nin_base])
 * 3. After preprocessing, bare \FF survives and the detector wrongly suggests \FF[…]
 *    by greedily consuming the encoded [b=...] bracket that follows
 *
 * The detector should NOT suggest tags that already exist in the active tag config.
 * Additionally, when \FF[...] is known, \FF\FF[value] should parse the first \FF
 * as either a parameterless tag or ignore it, but NOT suggest \FF[…] as unknown.
 */
describe('Unknown tag detector with LL_StandingPicture tags', () => {
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

    /**
     * Replicates the core logic of AIEngine.scanForUnknownTags:
     * 1. Preprocess text through TagManager (known tags get encoded)
     * 2. Scan remaining text for escape-like patterns
     * 3. Filter out patterns already covered by registered tags
     * 4. Return detected patterns
     */
    function scanForUnknownTags(tagManager, texts) {
        const ESC_TAG_SOURCE =
            '(?:\\\\|\\u001b)([A-Za-z${}|.!><^][A-Za-z0-9]*)' +
            '(?:\\[(\\d+)\\]|\\[([^\\]\\n]*)\\]|<([^>\\n]*)>|\\(([^)\\n]*)\\)|\\{([^}\\n]*)\\})?';
        const ESC_TAG_RE = new RegExp(ESC_TAG_SOURCE, 'g');

        const counts = new Map();

        const recordEsc = (sym, numVal, sqVal, angVal, roundVal, curlyVal) => {
            const normalizedSym = String(sym || '').toUpperCase();
            let pattern;
            if (numVal !== undefined) {
                pattern = `\\${normalizedSym}[N]`;
            } else if (sqVal !== undefined) {
                pattern = `\\${normalizedSym}[…]`;
            } else if (angVal !== undefined) {
                pattern = `\\${normalizedSym}<…>`;
            } else if (roundVal !== undefined) {
                pattern = `\\${normalizedSym}(…)`;
            } else if (curlyVal !== undefined) {
                pattern = `\\${normalizedSym}{…}`;
            } else {
                pattern = `\\${normalizedSym}`;
            }
            counts.set(pattern, (counts.get(pattern) || 0) + 1);
        };

        for (const key of texts) {
            if (typeof key !== 'string') continue;

            let text = key;
            try {
                const result = tagManager.preprocessTags(key);
                text = result.preprocessedText;
            } catch (_e) {
                // keep original
            }

            let m;
            ESC_TAG_RE.lastIndex = 0;
            while ((m = ESC_TAG_RE.exec(text)) !== null) {
                recordEsc(m[1], m[2], m[3], m[4], m[5], m[6]);
            }
        }

        // Filter out patterns already covered by registered tags
        const registeredPatterns = tagManager.getRegisteredDetectionPatterns();
        for (const pattern of registeredPatterns) {
            counts.delete(pattern);
        }

        return Array.from(counts.entries())
            .map(([pattern, count]) => ({ pattern, count }))
            .sort((a, b) => b.count - a.count);
    }

    function createTagManager() {
        const tagManager = new TagManager(null);
        tagManager.setCustomTagConfigs(LL_STANDING_PICTURE_PLUGIN_TAGS);
        return tagManager;
    }

    it('should NOT suggest \\FF[…] when \\FF[...] is already registered', () => {
        const tagManager = createTagManager();
        const input = 'ほう、領民はおらんのか。\n\\FF\\FF[nin_base]\\F[maou_base]\\AA[F]';

        const results = scanForUnknownTags(tagManager, [input]);

        // \FF[…] should NOT appear because it's already a known tag
        const ffBracket = results.find((r) => r.pattern === '\\FF[…]');
        expect(ffBracket).toBeUndefined();
    });

    it('getRegisteredDetectionPatterns includes \\FF[…] and \\FF[N] for registered custom param tags', () => {
        const tagManager = createTagManager();
        const registered = tagManager.getRegisteredDetectionPatterns();

        // \FF with bracket '[' should produce both pattern variants
        expect(registered.has('\\FF[…]')).toBe(true);
        expect(registered.has('\\FF[N]')).toBe(true);
        expect(registered.has('\\F[…]')).toBe(true);
        expect(registered.has('\\AA[…]')).toBe(true);
    });

    it('bare \\FF after preprocessing is filtered out by registered patterns in full scan pipeline', () => {
        const tagManager = createTagManager();
        const input = '\\FF\\FF[nin_base]';

        // Full scan pipeline (with filtering) should not report \FF[…]
        const results = scanForUnknownTags(tagManager, [input]);
        const ffBracket = results.find(
            (r) => r.pattern === '\\FF[…]' || r.pattern === '\\FF[N]'
        );
        expect(ffBracket).toBeUndefined();
    });
});
