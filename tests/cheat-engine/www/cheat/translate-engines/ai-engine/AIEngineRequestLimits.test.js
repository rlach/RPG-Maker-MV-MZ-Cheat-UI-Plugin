import { afterEach, describe, expect, it, vi } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import { RetryHandler } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/RetryHandler.js';

afterEach(() => vi.unstubAllGlobals());

describe('JSON repair requests', () => {
    function setup(...responses) {
        const engine = { selectedModel: 'test-model', requestChatCompletion: vi.fn() };
        for (const response of responses)
            engine.requestChatCompletion.mockResolvedValueOnce(response);
        return { engine, handler: new RetryHandler(engine) };
    }

    it.each([
        null,
        undefined,
        '',
        '   ',
        'null',
        'undefined',
        'No answer available',
        '<think>{"x":1}</think>',
    ])('does not repair missing JSON: %s', async (response) => {
        const { engine, handler } = setup();
        expect(
            await handler.handleJsonError({ strategy: 'askAIToFix', previousResponse: response })
        ).toEqual({ ok: false, error: 'NO_JSON_TO_REPAIR' });
        expect(engine.requestChatCompletion).not.toHaveBeenCalled();
    });

    it('sends the malformed fragment with model, streaming and a finite token cap', async () => {
        const { engine, handler } = setup({ text: '{"m1":"Hello"}' });
        expect(
            await handler.retryJsonRepair('Here is JSON: ```json\n{"m1":"Hello\n```')
        ).toMatchObject({ ok: true, repaired: { m1: 'Hello' } });
        const [payload, options] = engine.requestChatCompletion.mock.calls[0];
        expect(payload).toMatchObject({ model: 'test-model', stream: true });
        expect(payload.max_tokens).toBeGreaterThan(0);
        expect(payload.messages[0].content).not.toContain('Here is JSON');
        expect(options.monitorJson).toBe(false);
    });

    it.each(['No JSON available', null, '', '<think>{"m1":"Thinking"}</think>'])(
        'stops repair recursion on unusable output: %s',
        async (text) => {
            const { engine, handler } = setup({ text });
            expect((await handler.retryJsonRepair('{"m1":bad}')).ok).toBe(false);
            expect(engine.requestChatCompletion).toHaveBeenCalledTimes(1);
        }
    );

    it('does not recurse after a budget cancellation with invalid JSON', async () => {
        const { engine, handler } = setup({
            text: '{"m1":bad}',
            cancelledByGuardrail: true,
            cancelReason: 'output_budget_exceeded',
        });
        expect(await handler.retryJsonRepair('{"m1":bad}')).toEqual({
            ok: false,
            error: 'output_budget_exceeded',
        });
        expect(engine.requestChatCompletion).toHaveBeenCalledTimes(1);
    });
});

describe('request output budget', () => {
    function setup(events) {
        const engine = new AIEngine({ sourceLang: 'ja', targetLang: 'en' });
        const cancel = vi.fn();
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            start(controller) {
                for (const event of events)
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                // Keep the stream open to verify client cancellation.
            },
            cancel,
        });
        const requestFetch = vi.fn(
            async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })
        );
        vi.stubGlobal('window', { chromiumFetch: requestFetch });
        return { engine, cancel, requestFetch };
    }

    it.each(['reasoning_content', 'reasoning', 'content'])(
        'aborts runaway %s even without JSON monitoring',
        async (field) => {
            const { engine, cancel, requestFetch } = setup([
                { choices: [{ delta: { [field]: 'thinking '.repeat(10) } }] },
            ]);
            const result = await engine.requestChatCompletion(
                { max_tokens: 4, messages: [] },
                { monitorJson: false }
            );
            expect(result.cancelReason).toBe('output_budget_exceeded');
            expect(cancel).toHaveBeenCalledOnce();
            expect(requestFetch.mock.calls[0][1].signal.aborted).toBe(true);
            if (field !== 'content') expect(result.text).toBe('');
        }
    );

    it('counts content and reasoning together and respects max_completion_tokens precedence', async () => {
        const { engine } = setup([
            { choices: [{ delta: { content: '123456789', reasoning_content: '123456789' } }] },
        ]);
        expect(
            (
                await engine.requestChatCompletion(
                    { max_tokens: 100, max_completion_tokens: 2 },
                    { monitorJson: false }
                )
            ).cancelReason
        ).toBe('output_budget_exceeded');
    });

    it('uses reported completion tokens without counting prompt tokens', async () => {
        const { engine } = setup([
            { usage: { prompt_tokens: 10000, completion_tokens: 1 } },
            { usage: { completion_tokens: 5 } },
        ]);
        expect((await engine.requestChatCompletion({ max_tokens: 4 })).cancelReason).toBe(
            'output_budget_exceeded'
        );
    });

    it.each([undefined, 0, -1, null])(
        'provides a finite default for absent or unlimited caps: %s',
        async (limit) => {
            const { engine, requestFetch } = setup([{ usage: { completion_tokens: 10000 } }]);
            await engine.requestChatCompletion({
                max_tokens: limit,
                messages: [{ role: 'user', content: 'hello' }],
            });
            const payload = JSON.parse(requestFetch.mock.calls[0][1].body);
            expect(payload.max_tokens).toBe(25);
        }
    );

    it('does not treat a null assistant response envelope as translation JSON', () => {
        const engine = new AIEngine({});
        expect(engine.extractAssistantTextFromApiResponse('null')).toBe('');
        expect(
            engine.extractAssistantTextFromApiResponse(
                JSON.stringify({
                    choices: [{ message: { content: null, reasoning_content: 'Thinking' } }],
                })
            )
        ).toBe('');
    });
});
