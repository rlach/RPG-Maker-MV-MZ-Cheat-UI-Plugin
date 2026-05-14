import { describe, expect, it } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';

function createEngine() {
    return new AIEngine({ sourceLang: 'ja', targetLang: 'en' });
}

describe('AIEngine.scanForUnknownTags case sensitivity', () => {
    it(String.raw`normalizes lowercase unknown tag symbol to uppercase suggestion pattern`, () => {
        const engine = createEngine();
        const cache = new Map([[String.raw`message:ja-en-\n[hero_name] says hi`, '']]);

        const results = engine.scanForUnknownTags(cache);
        const patterns = new Set(results.map((r) => r.pattern));

        expect(patterns.has(String.raw`\N[…]`)).toBe(true);
        expect(patterns.has(String.raw`\n[…]`)).toBe(false);
    });

    it(String.raw`keeps unknown lowercase \n[...] visible when only uppercase \N<...> is registered`, () => {
        const engine = createEngine();

        engine.setCustomTags([
            {
                description: 'uppercase N custom angle parameter',
                type: 'withCustomParameter',
                tagSymbol: 'N',
                bracket: '<',
                maskValue: false,
                requiredConsistency: true,
            },
        ]);

        const cache = new Map([[String.raw`message:ja-en-\n[hero_name] says hi`, '']]);
        const results = engine.scanForUnknownTags(cache);
        const patterns = new Set(results.map((r) => r.pattern));

        expect(patterns.has(String.raw`\N[…]`)).toBe(true);
        expect(patterns.has(String.raw`\n[…]`)).toBe(false);
    });

    it(String.raw`aggregates \N[...] and \n[...] into one normalized suggestion`, () => {
        const engine = createEngine();
        const cache = new Map([
            [String.raw`message:ja-en-\N[hero_name] and \n[hero_name]`, ''],
        ]);

        const results = engine.scanForUnknownTags(cache);
        const normalizedTag = results.find((r) => r.pattern === String.raw`\N[…]`);

        expect(normalizedTag?.count).toBe(2);
        expect(results.some((r) => r.pattern === String.raw`\n[…]`)).toBe(false);
    });
});
