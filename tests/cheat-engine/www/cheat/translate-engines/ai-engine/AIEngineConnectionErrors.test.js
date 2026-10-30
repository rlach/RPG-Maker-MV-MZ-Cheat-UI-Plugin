import { afterEach, expect, it, vi } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import { RetryHandler } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/RetryHandler.js';
import {
    LLM_CONNECTION_ERROR,
    LlmConnectionError,
} from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/LlmConnectionError.js';

afterEach(() => vi.unstubAllGlobals());

it.each([404, 401, 503, 'ERR_CONNECTION_REFUSED', 'Failed to fetch'])(
    'reports connection failure %s without JSON recovery',
    async (failure) => {
        vi.stubGlobal('window', globalThis);
        const notify = vi.fn();
        const engine = new AIEngine({
            sourceLang: 'ja',
            targetLang: 'en',
            translationCache: new Map(),
            notify,
        });
        engine.selectedModel = 'test';
        engine.invalidJsonHandlingStrategy = 'askAIToFix';
        vi.spyOn(engine.tagManager, 'buildNameHints').mockReturnValue('');
        const fetchMock = vi.fn(async () => {
            if (typeof failure === 'string') throw new TypeError(failure);
            return { ok: false, status: failure };
        });
        vi.stubGlobal('fetch', fetchMock);
        const repair = vi.spyOn(engine.retryHandler, 'handleJsonError');
        const result = await engine.batchTranslate([
            { type: 'item_name', id: 1, value: '原文', cacheKey: 'one' },
        ]);
        expect(result.failures[0].cancelReason).toBe(LLM_CONNECTION_ERROR);
        expect(result.failures[0].rejectReason).toContain('Check the host, port, endpoint');
        expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('Could not connect'));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(repair).not.toHaveBeenCalled();
    }
);

it('propagates connection failures during JSON repair', async () => {
    const engine = {
        requestChatCompletion: vi.fn().mockRejectedValue(new LlmConnectionError('HTTP 404')),
    };
    const handler = new RetryHandler(engine);
    await expect(handler.retryJsonRepair('{"a":bad}')).rejects.toMatchObject({
        code: LLM_CONNECTION_ERROR,
    });
    expect(engine.requestChatCompletion).toHaveBeenCalledTimes(1);
});

it('does not report user cancellation as a connection failure', async () => {
    const notify = vi.fn();
    const engine = new AIEngine({ sourceLang: 'ja', targetLang: 'en', notify });
    vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    );
    expect(await engine.requestChatCompletion({ messages: [] })).toMatchObject({
        cancelReason: 'request_aborted',
    });
    expect(notify).not.toHaveBeenCalled();
});
