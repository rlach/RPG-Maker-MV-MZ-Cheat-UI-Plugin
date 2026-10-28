import { afterEach, expect, it, vi } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';

afterEach(() => vi.unstubAllGlobals());

it('rejects only the batch item containing a broken known tag', async () => {
    vi.stubGlobal('window', globalThis);
    const engine = new AIEngine({
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map(),
    });
    engine.selectedModel = 'test';
    engine.askAiIfTextTranslated = false;
    vi.spyOn(engine.tagManager, 'buildNameHints').mockReturnValue('');
    vi.spyOn(engine, 'requestChatCompletion').mockImplementation(async (payload) => {
        const content = payload.messages.findLast((message) => message.role === 'user').content;
        const keys = Object.keys(JSON.parse(content.slice(content.indexOf('{'))));
        return {
            text: JSON.stringify({
                [keys[0]]: 'Broken.TAG:sn⟫text',
                [keys[1]]: 'Ordinary TAG: label << >>',
            }),
        };
    });
    const result = await engine.batchTranslate([
        { type: 'item_name', id: 1, value: '原文一', cacheKey: 'one' },
        { type: 'item_name', id: 2, value: '原文二', cacheKey: 'two' },
    ]);
    expect(result.successes.map((entry) => entry.id)).toEqual([2]);
    expect(result.failures.map((entry) => entry.id)).toEqual([1]);
    expect(result.failures[0].rejectReason).toBe('Broken encoded tags left in output');
});
