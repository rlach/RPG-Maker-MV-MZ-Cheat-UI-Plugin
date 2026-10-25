import { afterEach, expect, it, vi } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import { mergeKnowledgeEntries } from '../../../../../../cheat-engine/www/cheat/js/KnowledgeBaseRuntime.js';

vi.mock('../../../../../../cheat-engine/www/cheat/js/KnowledgeBaseRuntime.js', () => ({
    ensureKnowledgeForLangPair() {},
    getKnowledgeEntries: () => [],
    mergeKnowledgeEntries: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

it('keeps the translated batch and valid names while dropping polluted knowledge entries', async () => {
    const engine = new AIEngine({
        sourceLang: 'ja',
        targetLang: 'en',
        askLlmToAddToKnowledge: true,
        translationCache: new Map(),
    });
    engine.selectedModel = 'test';
    engine.askAiIfTextTranslated = false;
    vi.spyOn(engine.tagManager, 'buildNameHints').mockReturnValue('');
    vi.spyOn(engine, 'requestChatCompletion').mockImplementation(async (payload) => {
        const content = payload.messages.findLast((message) => message.role === 'user').content;
        const map = JSON.parse(content.slice(content.indexOf('{')));
        return {
            text: JSON.stringify({
                ...Object.fromEntries(Object.keys(map).map((key) => [key, 'Translated item'])),
                kbase: [
                    { key: '[b=カンディダ]', translation: '[b=Candida]' },
                    { key: 'Rosa', translation: '⟪TAG:Rosa⟫' },
                    { key: 'Other', translation: 'Other', info: '<<TAG:pollution>>' },
                    {
                        key: 'カンディダ＝ローザ',
                        translation: 'Candida Rosa',
                        description: 'Light magic',
                    },
                ],
            }),
        };
    });
    const result = await engine.batchTranslate([
        { type: 'item_name', id: 1, value: '名前', cacheKey: 'test' },
    ]);
    expect(result.failures).toEqual([]);
    expect(result.successes[0].translated).toBe('Translated item');
    expect(mergeKnowledgeEntries).toHaveBeenCalledWith([
        { key: 'カンディダ＝ローザ', translation: 'Candida Rosa', info: 'Light magic' },
    ]);
});
