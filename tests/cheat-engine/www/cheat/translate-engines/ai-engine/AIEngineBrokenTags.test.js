import { afterEach, expect, it, vi } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';

afterEach(() => vi.unstubAllGlobals());

it('accepts tag fragments with an advisory on each affected batch item', async () => {
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
    expect(result.successes.map((entry) => entry.id)).toEqual([1, 2]);
    expect(result.failures).toEqual([]);
    expect(result.successes[0].suspicions.map((reason) => reason.id)).toContain('partial-tags');
    expect(result.successes[1].suspicions.map((reason) => reason.id)).toContain('partial-tags');
});
