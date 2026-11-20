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

    it(
        String.raw`keeps unknown lowercase \n[...] visible when only uppercase \N<...> is registered`,
        () => {
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
        }
    );

    it(String.raw`aggregates \N[...] and \n[...] into one normalized suggestion`, () => {
        const engine = createEngine();
        const cache = new Map([[String.raw`message:ja-en-\N[hero_name] and \n[hero_name]`, '']]);

        const results = engine.scanForUnknownTags(cache);
        const normalizedTag = results.find((r) => r.pattern === String.raw`\N[…]`);

        expect(normalizedTag?.count).toBe(2);
        expect(results.some((r) => r.pattern === String.raw`\n[…]`)).toBe(false);
    });
});

it('reports CE when a registered C command shares its prefix', () => {
    const engine = createEngine();
    engine.tagManager.setCustomTagConfigs([
        {
            description: 'Reset color',
            requiredConsistency: false,
            type: 'withoutParameter',
            tagSymbol: 'C',
        },
    ]);
    const source = String.raw`\CE[511]はぁあー！`;
    expect(engine.tagManager.preprocessTags(source).preprocessedText).toBe(source);
    expect(engine.scanForUnknownTags([source])).toContainEqual(expect.objectContaining({
        pattern: String.raw`\CE[N]`,
        count: 1,
    }));
});
it('keeps incomplete name escapes visible and supplies only the source keys that produced the detection', async () => {
    const { findTagExamples } = await import('../../../../../../cheat-engine/www/cheat/panels/translate-tag-manager/UnknownTagsModal.js');
    const engine = createEngine();
    engine.setCustomTags([{ description: 'Name box', type: 'withCustomParameter', tagSymbol: 'N', bracket: '<', maskValue: false }]);
    const malformed = ['\\N[1', '\\N<\\N[2]「Text」', '\\N[1>「Yes」'];
    const valid = ['\\N[1]', '\\N<\\N[2]>「Valid」', 'First\nSecond'];
    const cache = new Map([...malformed, ...valid].map(text => ['message:ja-en-'+text, '']));
    const row = engine.scanForUnknownTags(cache).find(row => row.pattern === '\\N');
    expect(row.count).toBe(3);
    expect(row.exampleKeys).toHaveLength(3);
    const examples = findTagExamples(cache, row.pattern, row.exampleKeys);
    expect(examples).toHaveLength(3);
    expect(examples.map(parts => parts.map(part => part.text).join(''))).toEqual(malformed);
    for (const parts of examples) expect(parts.filter(part => part.highlighted).map(part => part.text)).toEqual(['\\N']);
});
