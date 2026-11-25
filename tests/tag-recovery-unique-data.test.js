import { expect, it, vi, afterEach } from 'vitest';
import { TagFormatRecovery } from '../cheat-engine/www/cheat/translate-engines/ai-engine/TagFormatRecovery.js';
vi.mock(
    '../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
afterEach(() => vi.unstubAllGlobals());
for (const base of ['tags', 'legacy'])
    it(`alternates per source after three unresolved errors from ${base}`, () => {
        const history = new TagFormatRecovery();
        const runtime = { sourceLang: 'ja', targetLang: 'en' };
        const item = { type: 'message', value: 'source' };
        for (let i = 0; i < 3; i++) {
            expect(history.next(item, runtime, base)).toBe(base);
            history.failed(item, runtime, base);
        }
        const other = base === 'tags' ? 'legacy' : 'tags';
        expect([0, 1, 2, 3].map(() => history.next(item, runtime, base))).toEqual([
            other,
            base,
            other,
            base,
        ]);
        expect(history.next({ ...item, value: 'other' }, runtime, base)).toBe(base);
        history.succeeded(item, runtime, base);
        expect(history.next(item, runtime, base)).toBe(base);
    });
import AIEngine from '../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
for (const base of ['tags', 'legacy'])
    it(`sends alternating transport formats through the actual engine from ${base}`, async () => {
        vi.stubGlobal('window', globalThis);
        const engine = new AIEngine({
            sourceLang: 'ja',
            targetLang: 'en',
            translationCache: new Map(),
            cleanTranslatedText: (text) => text,
            wrapText: (text) => text,
        });
        engine.selectedModel = 'test';
        engine.askAiIfTextTranslated = false;
        engine.tagManager.setTagFormat(base);
        vi.spyOn(engine.tagManager, 'buildNameHints').mockReturnValue('');
        const formats = [];
        vi.spyOn(engine, 'requestChatCompletion').mockImplementation(async (payload) => {
            const content = payload.messages.findLast((x) => x.role === 'user').content;
            const data = JSON.parse(content.slice(content.indexOf('{')));
            const key = Object.keys(data)[0];
            const value = data[key];
            formats.push(value.includes('⟪TAG:') ? 'tags' : 'legacy');
            return {
                text: JSON.stringify({
                    [key]: formats.length < 6 ? value + ' TAG:broken⟫' : value,
                }),
            };
        });
        const item = { type: 'message', id: 1, value: '原文\n続き', cacheKey: 'source' };
        for (let i = 0; i < 5; i++)
            expect((await engine.batchTranslate([item])).failures).toHaveLength(1);
        expect((await engine.batchTranslate([item])).successes).toHaveLength(1);
        const other = base === 'tags' ? 'legacy' : 'tags';
        expect(formats).toEqual([base, base, base, other, base, other]);
        expect(engine.tagManager.syntax.format).toBe(base);
        expect((await engine.batchTranslate([item])).successes).toHaveLength(1);
        expect(formats.at(-1)).toBe(base);
    });
