import { describe, expect, it } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';

function createEngine() {
    return new AIEngine({ sourceLang: 'ja', targetLang: 'en' });
}

describe('AIEngine.scanForUnknownTags case sensitivity', () => {
    it('reports lowercase unknown tag symbol as lowercase (does not upcase to \\N)', () => {
        const engine = createEngine();
        const cache = new Map([['message:ja-en-\\n[hero_name] says hi', '']]);

        const results = engine.scanForUnknownTags(cache);
        const patterns = new Set(results.map((r) => r.pattern));

        expect(patterns.has('\\n[…]')).toBe(true);
        expect(patterns.has('\\N[…]')).toBe(false);
    });

    it('does not let registered uppercase \\N<...> hide lowercase unknown \\n[...]', () => {
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

        const cache = new Map([['message:ja-en-\\n[hero_name] says hi', '']]);
        const results = engine.scanForUnknownTags(cache);
        const patterns = new Set(results.map((r) => r.pattern));

        expect(patterns.has('\\n[…]')).toBe(true);
        expect(patterns.has('\\N[…]')).toBe(false);
    });
});
