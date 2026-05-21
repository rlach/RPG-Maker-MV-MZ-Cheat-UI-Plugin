import { describe, expect, it } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import { SIMPLE_NEWLINE_TAG_CONFIG } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/constants.js';

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

function setNewlineConsistency(engine, enabled) {
    engine.setOverrides(SIMPLE_NEWLINE_TAG_CONFIG, 'default', '', {
        requiredConsistency: !!enabled,
    });
}

describe('AIEngine.validateNewlineCounts', () => {
    it('case 1: requiredConsistency=false, addBoxWidthInfoToLlmPrompt=false skips newline validation everywhere', () => {
        const engine = new AIEngine(createRuntime({ addBoxWidthInfoToLlmPrompt: false }));
        setNewlineConsistency(engine, false);

        const messageResult = engine.validateNewlineCounts(
            createItem('message', 0),
            createPostprocessResult(1)
        );
        const descriptionResult = engine.validateNewlineCounts(
            createItem('item_description', 0),
            createPostprocessResult(2)
        );

        expect(messageResult.valid).toBe(true);
        expect(descriptionResult.valid).toBe(true);
    });

    it('case 2: requiredConsistency=false, addBoxWidthInfoToLlmPrompt=true validates only description box height', () => {
        const engine = new AIEngine(
            createRuntime({
                addBoxWidthInfoToLlmPrompt: true,
                descriptionMaxRows: 2,
            })
        );
        setNewlineConsistency(engine, false);

        const messageResult = engine.validateNewlineCounts(
            createItem('message', 0),
            createPostprocessResult(3)
        );
        const descriptionOkResult = engine.validateNewlineCounts(
            createItem('item_description', 0),
            createPostprocessResult(1)
        );
        const descriptionFailResult = engine.validateNewlineCounts(
            createItem('item_description', 0),
            createPostprocessResult(2)
        );

        expect(messageResult.valid).toBe(true);
        expect(descriptionOkResult.valid).toBe(true);
        expect(descriptionFailResult.valid).toBe(false);
        expect(descriptionFailResult.errorReason).toBe('Newlines outside box');
    });

    it('case 3: requiredConsistency=true, addBoxWidthInfoToLlmPrompt=false enforces strict newline consistency everywhere', () => {
        const engine = new AIEngine(createRuntime({ addBoxWidthInfoToLlmPrompt: false }));
        setNewlineConsistency(engine, true);

        const messageMismatch = engine.validateNewlineCounts(
            createItem('message', 0),
            createPostprocessResult(1)
        );
        const descriptionMismatch = engine.validateNewlineCounts(
            createItem('item_description', 1),
            createPostprocessResult(2)
        );
        const descriptionMatch = engine.validateNewlineCounts(
            createItem('item_description', 1),
            createPostprocessResult(1)
        );

        expect(messageMismatch.valid).toBe(false);
        expect(messageMismatch.errorReason).toBe('Newline count mismatch');
        expect(descriptionMismatch.valid).toBe(false);
        expect(descriptionMismatch.errorReason).toBe('Newline count mismatch');
        expect(descriptionMatch.valid).toBe(true);
    });

    it('case 4: requiredConsistency=true, addBoxWidthInfoToLlmPrompt=true uses box logic for descriptions and strict for others', () => {
        const engine = new AIEngine(
            createRuntime({
                addBoxWidthInfoToLlmPrompt: true,
                descriptionMaxRows: 2,
            })
        );
        setNewlineConsistency(engine, true);

        const messageMismatch = engine.validateNewlineCounts(
            createItem('message', 0),
            createPostprocessResult(1)
        );
        const descriptionOkResult = engine.validateNewlineCounts(
            createItem('item_description', 0),
            createPostprocessResult(1)
        );
        const descriptionFailResult = engine.validateNewlineCounts(
            createItem('item_description', 0),
            createPostprocessResult(2)
        );

        expect(messageMismatch.valid).toBe(false);
        expect(messageMismatch.errorReason).toBe('Newline count mismatch');
        expect(descriptionOkResult.valid).toBe(true);
        expect(descriptionFailResult.valid).toBe(false);
        expect(descriptionFailResult.errorReason).toBe('Newlines outside box');
    });

    it('exposes newline tag in default tag configs for UI and override editing', () => {
        const engine = new AIEngine(createRuntime());
        const tags = engine.getDefaultTagConfigsForUi();
        const newlineTag = tags.find((tag) => tag?._isSimpleNTag);

        expect(newlineTag).toBeTruthy();
        expect(newlineTag.tagSymbol).toBe('sn');
        expect(newlineTag.requiredConsistency).toBe(true);
        expect(newlineTag.reservedWidth).toBe(0);
        expect(newlineTag.extraPromptForLlm).toContain('represents newline');
    });
});
