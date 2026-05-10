/**
 * Regression tests for AIEngine.normalizeCustomTagConfig.
 *
 * Bug: normalizeCustomTagConfig built a fixed-shape object that omitted
 * alwaysTranslate and alwaysAddToKnowledgeBase, causing these flags to be
 * silently stripped when plugin tags were registered via addPluginTags().
 */

import { describe, expect, it } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';

// Minimal runtime stub — AIEngine only reads properties from runtime during
// translation calls, not during construction / normalizeCustomTagConfig.
const PANEL_STUB = { sourceLang: 'ja', targetLang: 'en' };

function createEngine() {
    return new AIEngine(PANEL_STUB);
}

// ---------------------------------------------------------------------------
// normalizeCustomTagConfig: alwaysTranslate and alwaysAddToKnowledgeBase
// ---------------------------------------------------------------------------

describe('AIEngine.normalizeCustomTagConfig: preserves alwaysTranslate', () => {
    it('preserves alwaysTranslate: true on withCustomParameter non-masked tag', () => {
        const engine = createEngine();
        const result = engine.normalizeCustomTagConfig({
            description: 'NW tag',
            type: 'withCustomParameter',
            tagSymbol: 'NW',
            bracket: '[',
            maskValue: false,
            requiredConsistency: true,
            alwaysTranslate: true,
        });
        expect(result.alwaysTranslate).toBe(true);
    });

    it('preserves alwaysTranslate: true on withNumericParameter tag', () => {
        const engine = createEngine();
        const result = engine.normalizeCustomTagConfig({
            description: 'numeric tag',
            type: 'withNumericParameter',
            tagSymbol: 'XT',
            requiredConsistency: true,
            alwaysTranslate: true,
        });
        expect(result.alwaysTranslate).toBe(true);
    });

    it('preserves alwaysTranslate: true on withoutParameter tag', () => {
        const engine = createEngine();
        const result = engine.normalizeCustomTagConfig({
            description: 'no-param tag',
            type: 'withoutParameter',
            tagSymbol: 'XP',
            requiredConsistency: true,
            alwaysTranslate: true,
        });
        expect(result.alwaysTranslate).toBe(true);
    });

    it('defaults alwaysTranslate to false when not specified', () => {
        const engine = createEngine();
        const result = engine.normalizeCustomTagConfig({
            description: 'plain tag',
            type: 'withNumericParameter',
            tagSymbol: 'V',
            requiredConsistency: true,
        });
        expect(result.alwaysTranslate).toBe(false);
    });

    it('defaults alwaysTranslate to false for falsy values', () => {
        const engine = createEngine();
        const result = engine.normalizeCustomTagConfig({
            description: 'tag with null flag',
            type: 'withoutParameter',
            tagSymbol: 'G',
            requiredConsistency: true,
            alwaysTranslate: null,
        });
        expect(result.alwaysTranslate).toBe(false);
    });
});

describe('AIEngine.normalizeCustomTagConfig: preserves alwaysAddToKnowledgeBase', () => {
    it('preserves alwaysAddToKnowledgeBase: true on withCustomParameter tag', () => {
        const engine = createEngine();
        const result = engine.normalizeCustomTagConfig({
            description: 'category tag',
            type: 'withCustomParameter',
            tagSymbol: 'CAT',
            bracket: '[',
            maskValue: false,
            requiredConsistency: true,
            alwaysAddToKnowledgeBase: true,
        });
        expect(result.alwaysAddToKnowledgeBase).toBe(true);
    });

    it('defaults alwaysAddToKnowledgeBase to false when not specified', () => {
        const engine = createEngine();
        const result = engine.normalizeCustomTagConfig({
            description: 'plain tag',
            type: 'withCustomParameter',
            tagSymbol: 'PL',
            bracket: '[',
            maskValue: false,
            requiredConsistency: true,
        });
        expect(result.alwaysAddToKnowledgeBase).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Regression: addPluginTags must preserve alwaysTranslate through the full
// normalizeCustomTagConfig → _refreshTagManager → tagEntries pipeline.
// ---------------------------------------------------------------------------

describe('AIEngine.addPluginTags: alwaysTranslate survives the full pipeline', () => {
    it('tag registered via addPluginTags retains alwaysTranslate: true in tagEntries', () => {
        const engine = createEngine();
        engine.addPluginTags('TestPlugin', [
            {
                description: 'NW name window',
                type: 'withCustomParameter',
                tagSymbol: 'NW',
                bracket: '[',
                maskValue: false,
                requiredConsistency: true,
                alwaysTranslate: true,
            },
        ]);

        const entry = engine.tagManager.tagEntries.find((e) => e.tagSymbol === 'NW');
        expect(entry).toBeDefined();
        expect(entry.alwaysTranslate).toBe(true);
    });

    it('tag registered via addPluginTags retains alwaysAddToKnowledgeBase: true in tagEntries', () => {
        const engine = createEngine();
        engine.addPluginTags('SceneGlossary', [
            {
                description: 'SG category (ja)',
                type: 'withCustomParameter',
                tagSymbol: 'SGカテゴリ',
                style: 'xml',
                bracket: 'none',
                maskValue: false,
                requiredConsistency: true,
                alwaysTranslate: true,
                alwaysAddToKnowledgeBase: true,
            },
        ]);

        const entry = engine.tagManager.tagEntries.find((e) => e.tagSymbol === 'SGカテゴリ');
        expect(entry).toBeDefined();
        expect(entry.alwaysTranslate).toBe(true);
        expect(entry.alwaysAddToKnowledgeBase).toBe(true);
    });

    it('masked tag registered via addPluginTags has alwaysTranslate forced false', () => {
        const engine = createEngine();
        engine.addPluginTags('TestPlugin', [
            {
                description: 'masked tag',
                type: 'withCustomParameter',
                tagSymbol: 'MK',
                bracket: '[',
                maskValue: true,
                requiredConsistency: true,
                alwaysTranslate: true, // should be stripped by TagManager
            },
        ]);

        const entry = engine.tagManager.tagEntries.find((e) => e.tagSymbol === 'MK');
        expect(entry).toBeDefined();
        expect(entry.alwaysTranslate).toBe(false);
    });

    it('getAlwaysTranslateTagIds detects tag from addPluginTags in preprocessed text', () => {
        const engine = createEngine();
        engine.addPluginTags('TestPlugin', [
            {
                description: 'NW name window',
                type: 'withCustomParameter',
                tagSymbol: 'NW',
                bracket: '[',
                maskValue: false,
                requiredConsistency: true,
                alwaysTranslate: true,
            },
        ]);

        const { preprocessedText } = engine.tagManager.preprocessTags('\\NW[住民]テキスト');
        const ids = engine.tagManager.getAlwaysTranslateTagIds([preprocessedText]);
        expect(ids.length).toBe(1);
        const entry = engine.tagManager.tagEntries.find((e) => e.tagSymbol === 'NW');
        expect(ids[0]).toBe(`b=${entry.tagId}`);
    });
});
