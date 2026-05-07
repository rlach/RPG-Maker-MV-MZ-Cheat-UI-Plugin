import { describe, expect, it } from 'vitest';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import { TAG_TYPE } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTagManager(customTagConfigs = []) {
    const tm = new TagManager(null);
    tm.setCustomTagConfigs(customTagConfigs);
    return tm;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TAG_ALWAYS_TRANSLATE_CUSTOM_PARAM = {
    description: 'name window tag',
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    tagSymbol: 'NW',
    bracket: '[',
    maskValue: false,
    requiredConsistency: true,
    alwaysTranslate: true,
};

const TAG_ALWAYS_TRANSLATE_NUMERIC = {
    description: 'numeric always translate',
    type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
    tagSymbol: 'XT',
    requiredConsistency: true,
    alwaysTranslate: true,
};

const TAG_ALWAYS_TRANSLATE_WITHOUT_PARAM = {
    description: 'no-param always translate',
    type: TAG_TYPE.WITHOUT_PARAMETER,
    tagSymbol: 'XP',
    requiredConsistency: true,
    alwaysTranslate: true,
};

const TAG_MASKED_ALWAYS_TRANSLATE = {
    description: 'masked tag claiming alwaysTranslate',
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    tagSymbol: 'MK',
    bracket: '[',
    maskValue: true,
    requiredConsistency: true,
    alwaysTranslate: true, // must be ignored because masked
};

const TAG_ALWAYS_KBASE = {
    description: 'category tag with kbase',
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    tagSymbol: 'CAT',
    bracket: '[',
    maskValue: false,
    requiredConsistency: true,
    alwaysTranslate: true,
    alwaysAddToKnowledgeBase: true,
};

const TAG_MASKED_ALWAYS_KBASE = {
    description: 'masked tag claiming alwaysAddToKnowledgeBase',
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    tagSymbol: 'MK2',
    bracket: '[',
    maskValue: true,
    requiredConsistency: true,
    alwaysAddToKnowledgeBase: true, // must be ignored because masked
};

const TAG_NUMERIC_ALWAYS_KBASE = {
    description: 'numeric tag claiming alwaysAddToKnowledgeBase',
    type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
    tagSymbol: 'NK',
    requiredConsistency: true,
    alwaysAddToKnowledgeBase: true, // must be ignored because numeric
};

const TAG_PLAIN_NO_FLAGS = {
    description: 'plain tag without flags',
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    tagSymbol: 'PL',
    bracket: '[',
    maskValue: false,
    requiredConsistency: true,
};

// ---------------------------------------------------------------------------
// validateAndNormalizeConfig: alwaysTranslate constraints
// ---------------------------------------------------------------------------

describe('validateAndNormalizeConfig: alwaysTranslate', () => {
    it('preserves alwaysTranslate true on withCustomParameter non-masked tag', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_CUSTOM_PARAM]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'NW');
        expect(entry.alwaysTranslate).toBe(true);
    });

    it('preserves alwaysTranslate true on withNumericParameter tag', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_NUMERIC]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'XT');
        expect(entry.alwaysTranslate).toBe(true);
    });

    it('preserves alwaysTranslate true on withoutParameter tag', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_WITHOUT_PARAM]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'XP');
        expect(entry.alwaysTranslate).toBe(true);
    });

    it('forces alwaysTranslate false when maskValue is true', () => {
        const tm = createTagManager([TAG_MASKED_ALWAYS_TRANSLATE]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'MK');
        expect(entry.alwaysTranslate).toBe(false);
    });

    it('defaults alwaysTranslate to false when not specified', () => {
        const tm = createTagManager([TAG_PLAIN_NO_FLAGS]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'PL');
        expect(entry.alwaysTranslate).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateAndNormalizeConfig: alwaysAddToKnowledgeBase constraints
// ---------------------------------------------------------------------------

describe('validateAndNormalizeConfig: alwaysAddToKnowledgeBase', () => {
    it('preserves alwaysAddToKnowledgeBase true on non-masked withCustomParameter', () => {
        const tm = createTagManager([TAG_ALWAYS_KBASE]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'CAT');
        expect(entry.alwaysAddToKnowledgeBase).toBe(true);
    });

    it('forces alwaysAddToKnowledgeBase false when maskValue is true', () => {
        const tm = createTagManager([TAG_MASKED_ALWAYS_KBASE]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'MK2');
        expect(entry.alwaysAddToKnowledgeBase).toBe(false);
    });

    it('forces alwaysAddToKnowledgeBase false for withNumericParameter', () => {
        const tm = createTagManager([TAG_NUMERIC_ALWAYS_KBASE]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'NK');
        expect(entry.alwaysAddToKnowledgeBase).toBe(false);
    });

    it('defaults alwaysAddToKnowledgeBase to false when not specified', () => {
        const tm = createTagManager([TAG_PLAIN_NO_FLAGS]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'PL');
        expect(entry.alwaysAddToKnowledgeBase).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getAlwaysTranslateTagIds
// ---------------------------------------------------------------------------

describe('getAlwaysTranslateTagIds', () => {
    it('returns empty array when no preprocessed texts are given', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_CUSTOM_PARAM]);
        expect(tm.getAlwaysTranslateTagIds([])).toEqual([]);
    });

    it('returns empty array when flag tags are not present in texts', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_CUSTOM_PARAM]);
        const ids = tm.getAlwaysTranslateTagIds(['some random text without any b= tags']);
        expect(ids).toEqual([]);
    });

    it('returns tag id when tag is present in preprocessed text', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_CUSTOM_PARAM]);
        // Preprocess a text that contains \NW[Hero] so we get [b=nw[Hero]]
        const { preprocessedText } = tm.preprocessTags('\\NW[Hero] said hello');
        const ids = tm.getAlwaysTranslateTagIds([preprocessedText]);
        expect(ids.length).toBe(1);
        expect(ids[0]).toMatch(/^b=/);
    });

    it('returns multiple tag ids when multiple alwaysTranslate tags are present', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_CUSTOM_PARAM, TAG_ALWAYS_TRANSLATE_WITHOUT_PARAM]);
        const { preprocessedText: t1 } = tm.preprocessTags('\\NW[Hero] text');
        const { preprocessedText: t2 } = tm.preprocessTags('\\XP rest');
        const ids = tm.getAlwaysTranslateTagIds([t1, t2]);
        expect(ids.length).toBe(2);
    });

    it('does not return masked tag even if it appears in text', () => {
        const tm = createTagManager([TAG_MASKED_ALWAYS_TRANSLATE, TAG_PLAIN_NO_FLAGS]);
        // even if the tag pattern appears, masked tags have alwaysTranslate: false
        const { preprocessedText } = tm.preprocessTags('\\MK[value] text');
        const ids = tm.getAlwaysTranslateTagIds([preprocessedText]);
        expect(ids).toEqual([]);
    });

    it('returns id only for tags present in the batch, not all registered alwaysTranslate tags', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_CUSTOM_PARAM, TAG_ALWAYS_TRANSLATE_WITHOUT_PARAM]);
        // Only preprocess text with NW, not XP
        const { preprocessedText } = tm.preprocessTags('\\NW[Alice] speaks');
        const ids = tm.getAlwaysTranslateTagIds([preprocessedText]);
        expect(ids.length).toBe(1);
        expect(ids[0]).toMatch(/^b=/);
        // XP is not in the text so it should not appear
        const nwEntry = tm.tagEntries.find((e) => e.tagSymbol === 'NW');
        expect(ids[0]).toBe(`b=${nwEntry.tagId}`);
    });

    it('handles null and non-string items in preprocessedTexts gracefully', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_CUSTOM_PARAM]);
        expect(() => tm.getAlwaysTranslateTagIds([null, undefined, 42, 'plain text'])).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// getAlwaysAddToKnowledgeBaseTagIds
// ---------------------------------------------------------------------------

describe('getAlwaysAddToKnowledgeBaseTagIds', () => {
    it('returns empty array when no preprocessed texts are given', () => {
        const tm = createTagManager([TAG_ALWAYS_KBASE]);
        expect(tm.getAlwaysAddToKnowledgeBaseTagIds([])).toEqual([]);
    });

    it('returns empty array when kbase tags are not present in texts', () => {
        const tm = createTagManager([TAG_ALWAYS_KBASE]);
        const ids = tm.getAlwaysAddToKnowledgeBaseTagIds(['plain text']);
        expect(ids).toEqual([]);
    });

    it('returns tag id when kbase tag is present in preprocessed text', () => {
        const tm = createTagManager([TAG_ALWAYS_KBASE]);
        const { preprocessedText } = tm.preprocessTags('\\CAT[Weapons] and stuff');
        const ids = tm.getAlwaysAddToKnowledgeBaseTagIds([preprocessedText]);
        expect(ids.length).toBe(1);
        const catEntry = tm.tagEntries.find((e) => e.tagSymbol === 'CAT');
        expect(ids[0]).toBe(`b=${catEntry.tagId}`);
    });

    it('does not return masked tag ids', () => {
        const tm = createTagManager([TAG_MASKED_ALWAYS_KBASE]);
        const { preprocessedText } = tm.preprocessTags('\\MK2[v] text');
        const ids = tm.getAlwaysAddToKnowledgeBaseTagIds([preprocessedText]);
        expect(ids).toEqual([]);
    });

    it('does not return numeric tag ids', () => {
        const tm = createTagManager([TAG_NUMERIC_ALWAYS_KBASE]);
        const { preprocessedText } = tm.preprocessTags('\\NK[3] text');
        const ids = tm.getAlwaysAddToKnowledgeBaseTagIds([preprocessedText]);
        expect(ids).toEqual([]);
    });

    it('returns empty array when non-array argument is passed', () => {
        const tm = createTagManager([TAG_ALWAYS_KBASE]);
        expect(tm.getAlwaysAddToKnowledgeBaseTagIds(null)).toEqual([]);
        expect(tm.getAlwaysAddToKnowledgeBaseTagIds(undefined)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Interaction: alwaysTranslate tag with XML-style (like SceneGlossary category)
// ---------------------------------------------------------------------------

describe('XML-style alwaysTranslate tag detection', () => {
    const XML_CATEGORY_TAG = {
        description: 'SG category (ja)',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'SGカテゴリ',
        style: 'xml',
        bracket: 'none',
        maskValue: false,
        requiredConsistency: true,
        alwaysTranslate: true,
        alwaysAddToKnowledgeBase: true,
    };

    it('detects alwaysTranslate and alwaysAddToKnowledgeBase for XML-style category tag', () => {
        const tm = createTagManager([XML_CATEGORY_TAG]);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'SGカテゴリ');
        expect(entry.alwaysTranslate).toBe(true);
        expect(entry.alwaysAddToKnowledgeBase).toBe(true);
    });

    it('returns tag id in getAlwaysTranslateTagIds when XML tag appears in preprocessed text', () => {
        const tm = createTagManager([XML_CATEGORY_TAG]);
        const { preprocessedText } = tm.preprocessTags('<SGカテゴリ:武器>');
        const ids = tm.getAlwaysTranslateTagIds([preprocessedText]);
        expect(ids.length).toBe(1);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'SGカテゴリ');
        expect(ids[0]).toBe(`b=${entry.tagId}`);
    });

    it('returns tag id in getAlwaysAddToKnowledgeBaseTagIds when XML tag appears in preprocessed text', () => {
        const tm = createTagManager([XML_CATEGORY_TAG]);
        const { preprocessedText } = tm.preprocessTags('<SGカテゴリ:武器>');
        const ids = tm.getAlwaysAddToKnowledgeBaseTagIds([preprocessedText]);
        expect(ids.length).toBe(1);
        const entry = tm.tagEntries.find((e) => e.tagSymbol === 'SGカテゴリ');
        expect(ids[0]).toBe(`b=${entry.tagId}`);
    });
});

// ---------------------------------------------------------------------------
// Deduplication: same tag appearing in multiple texts
// ---------------------------------------------------------------------------

describe('deduplication across multiple preprocessed texts', () => {
    it('does not return duplicate tag ids when same tag appears in multiple texts', () => {
        const tm = createTagManager([TAG_ALWAYS_TRANSLATE_CUSTOM_PARAM]);
        const { preprocessedText: t1 } = tm.preprocessTags('\\NW[Alice] hello');
        const { preprocessedText: t2 } = tm.preprocessTags('\\NW[Bob] world');
        const ids = tm.getAlwaysTranslateTagIds([t1, t2]);
        // The same tag entry should appear only once
        expect(ids.length).toBe(1);
    });
});
