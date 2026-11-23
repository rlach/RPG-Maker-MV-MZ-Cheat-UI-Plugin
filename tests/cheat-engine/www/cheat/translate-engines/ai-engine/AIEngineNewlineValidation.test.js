import { describe, expect, it, vi } from 'vitest';
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
        expect(descriptionOkResult.suspicions).toBeUndefined();
        expect(descriptionFailResult.valid).toBe(true);
        expect(descriptionFailResult.suspicions).toEqual([
            expect.objectContaining({
                id: 'newlines-outside-box',
                label: 'Newlines outside box',
            }),
        ]);
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
        expect(descriptionOkResult.suspicions).toBeUndefined();
        expect(descriptionFailResult.valid).toBe(true);
        expect(descriptionFailResult.suspicions).toEqual([
            expect.objectContaining({
                id: 'newlines-outside-box',
                label: 'Newlines outside box',
            }),
        ]);
    });

    it('keeps description translation with newlines-outside-box suspicion during batchTranslate', async () => {
        vi.stubGlobal('window', globalThis);
        try {
            const engine = new AIEngine(
                createRuntime({
                    addBoxWidthInfoToLlmPrompt: true,
                    descriptionMaxRows: 2,
                    translationCache: new Map(),
                    cleanTranslatedText: (text) => text,
                    wrapText: (text) => text,
                })
            );
            engine.selectedModel = 'test-model';
            engine.askAiIfTextTranslated = false;
            vi.spyOn(engine.tagManager, 'buildNameHints').mockReturnValue('');
            const snToken = engine.tagManager.syntax.encode('sn');
            vi.spyOn(engine, 'requestChatCompletion').mockImplementation(async (payload) => {
                const content = payload.messages.findLast((message) => message.role === 'user').content;
                const keys = Object.keys(JSON.parse(content.slice(content.indexOf('{'))));
                return {
                    text: JSON.stringify({
                        [keys[0]]: `Line 1${snToken}Line 2${snToken}Line 3.`,
                    }),
                };
            });

            const result = await engine.batchTranslate([
                {
                    type: 'item_description',
                    id: '0',
                    value: '説明文。',
                    cacheKey: 'item_description:ja-en-説明文。',
                },
            ]);

            expect(result.failures).toEqual([]);
            expect(result.successes).toHaveLength(1);
            expect(result.successes[0].translated).toBe('Line 1\nLine 2\nLine 3.');
            expect(result.successes[0].suspicions).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'newlines-outside-box',
                        label: 'Newlines outside box',
                    }),
                ])
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('exposes newline tag in default tag configs for UI and override editing', () => {
        const engine = new AIEngine(createRuntime());
        const tags = engine.getDefaultTagConfigsForUi();
        const newlineTag = tags.find((tag) => tag?._isSimpleNTag);

        expect(newlineTag).toBeTruthy();
        expect(newlineTag.tagSymbol).toBe('sn');
        expect(newlineTag.requiredConsistency).toBe(false);
        expect(newlineTag.reservedWidth).toBe(0);
        expect(newlineTag.extraPromptForLlm).toContain('represents newline');
    });
});
