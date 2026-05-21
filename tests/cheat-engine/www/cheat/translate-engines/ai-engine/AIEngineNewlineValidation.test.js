import { describe, expect, it } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';

function createRuntime(overrides = {}) {
    return {
        sourceLang: 'ja',
        targetLang: 'en',
        addBoxWidthInfoToLlmPrompt: false,
        descriptionMaxRows: 2,
        ...overrides,
    };
}

function createItem(type, expectedNewlineCount) {
    return {
        type,
        tagCounts: {
            simpleN: expectedNewlineCount,
        },
    };
}

function createPostprocessResult(actualNewlineCount) {
    return {
        actualCounts: {
            simpleN: actualNewlineCount,
        },
    };
}

describe('AIEngine.validateNewlineCounts', () => {
    it('rejects newline mismatch for regular text when box prompt is off', () => {
        const engine = new AIEngine(createRuntime({ addBoxWidthInfoToLlmPrompt: false }));
        const result = engine.validateNewlineCounts(
            createItem('message', 0),
            createPostprocessResult(1)
        );

        expect(result.valid).toBe(false);
        expect(result.errorReason).toBe('Newline count mismatch');
    });

    it('rejects newline mismatch for description text when box prompt is off', () => {
        const engine = new AIEngine(createRuntime({ addBoxWidthInfoToLlmPrompt: false }));
        const result = engine.validateNewlineCounts(
            createItem('item_description', 0),
            createPostprocessResult(1)
        );

        expect(result.valid).toBe(false);
        expect(result.errorReason).toBe('Newline count mismatch');
    });

    it('accepts matching newlines for description text when box prompt is off', () => {
        const engine = new AIEngine(createRuntime({ addBoxWidthInfoToLlmPrompt: false }));
        const result = engine.validateNewlineCounts(
            createItem('item_description', 1),
            createPostprocessResult(1)
        );

        expect(result.valid).toBe(true);
    });

    it('accepts description newline mismatch when box prompt is on and newlines are below max rows', () => {
        const engine = new AIEngine(
            createRuntime({
                addBoxWidthInfoToLlmPrompt: true,
                descriptionMaxRows: 2,
            })
        );
        const result = engine.validateNewlineCounts(
            createItem('item_description', 0),
            createPostprocessResult(1)
        );

        expect(result.valid).toBe(true);
    });

    it('rejects description when newlines are outside box with box prompt on', () => {
        const engine = new AIEngine(
            createRuntime({
                addBoxWidthInfoToLlmPrompt: true,
                descriptionMaxRows: 2,
            })
        );
        const result = engine.validateNewlineCounts(
            createItem('item_description', 0),
            createPostprocessResult(2)
        );

        expect(result.valid).toBe(false);
        expect(result.errorReason).toBe('Newlines outside box');
    });

    it('still rejects newline mismatch for non-description text when box prompt is on', () => {
        const engine = new AIEngine(
            createRuntime({
                addBoxWidthInfoToLlmPrompt: true,
                descriptionMaxRows: 2,
            })
        );
        const result = engine.validateNewlineCounts(
            createItem('message', 0),
            createPostprocessResult(1)
        );

        expect(result.valid).toBe(false);
        expect(result.errorReason).toBe('Newline count mismatch');
    });
});
