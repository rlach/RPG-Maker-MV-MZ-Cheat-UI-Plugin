import { describe, expect, it, vi } from 'vitest';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import UnknownTagsModal, {
    findTagExamples,
    filterUnknownTagsListByStyle,
    getUnknownTagsCacheStringCount,
} from '../../../../../../cheat-engine/www/cheat/panels/translate-tag-manager/UnknownTagsModal.js';

describe('UnknownTagsModal utilities', () => {
    it('filters only escape-style patterns', () => {
        const rows = [
            { pattern: String.raw`\N[…]`, count: 3 },
            { pattern: '<Foo:N>', count: 2 },
            { pattern: String.raw`\ABC`, count: 1 },
        ];

        const filtered = filterUnknownTagsListByStyle(rows, 'escape');
        expect(filtered).toEqual([
            { pattern: String.raw`\N[…]`, count: 3 },
            { pattern: String.raw`\ABC`, count: 1 },
        ]);
    });

    it('filters only xml-style patterns', () => {
        const rows = [
            { pattern: String.raw`\N[…]`, count: 3 },
            { pattern: '<Foo:N>', count: 2 },
            { pattern: '<Bar:…>', count: 1 },
        ];

        const filtered = filterUnknownTagsListByStyle(rows, 'xml');
        expect(filtered).toEqual([
            { pattern: '<Foo:N>', count: 2 },
            { pattern: '<Bar:…>', count: 1 },
        ]);
    });

    it('keeps all rows for both filter', () => {
        const rows = [
            { pattern: String.raw`\N[…]`, count: 3 },
            { pattern: '<Foo:N>', count: 2 },
        ];

        const filtered = filterUnknownTagsListByStyle(rows, 'both');
        expect(filtered).toEqual(rows);
    });

    it('counts only string cache keys', () => {
        const cache = new Map([
            ['message:ja-en-hello', 'hi'],
            ['speaker:ja-en-hero', 'Hero'],
            [123, 'skip'],
        ]);

        expect(getUnknownTagsCacheStringCount(cache)).toBe(2);
    });
});

it('highlights full tag occurrences without confusing symbols, numeric parameters or text markup', () => {
    const cache = new Map([
        ['message:ja-en-Before \\CE[12] after <unsafe>', ''],
        ['message:ja-en-Other \\CE[99]', ''],
        ['message:ja-en-Not \\CEE[12]', ''],
    ]);
    const examples = findTagExamples(cache, String.raw`\CE[N]`);
    expect(examples).toHaveLength(2);
    expect(examples[0].map((p) => p.text).join('')).toBe('Before \\CE[12] after <unsafe>');
    expect(examples[0].filter((p) => p.highlighted).map((p) => p.text)).toEqual(['\\CE[12]']);
    expect(
        findTagExamples(new Map([['<N> <Name:12>', '']]), '<N>')[0]
            .filter((p) => p.highlighted)
            .map((p) => p.text)
    ).toEqual(['<N>']);
    expect(findTagExamples(new Map([['\u001bCE[12]', '']]), String.raw`\CE[N]`)).toHaveLength(1);
});

it('closes the list before opening examples and restores it after closing', () => {
    const events = [];
    const ticks = [];
    const context = {
        ...UnknownTagsModal.data(),
        runtime: {
            translationCache: new Map([
                ['first \\CE[1]', ''],
                ['second \\CE[2]', ''],
            ]),
        },
        $emit: (...args) => events.push(args),
        $nextTick: (callback) => ticks.push(callback),
    };
    context.recycleExample = () => UnknownTagsModal.methods.recycleExample.call(context);
    UnknownTagsModal.methods.showExamples.call(context, { pattern: String.raw`\CE[N]` });
    expect(events).toEqual([['update:visible', false]]);
    expect(context.exampleOpen).toBe(false);
    ticks.shift()();
    expect(context.exampleOpen).toBe(true);
    const previous = context.exampleIndex;
    context.recycleExample();
    expect(context.exampleIndex).not.toBe(previous);
    UnknownTagsModal.methods.closeExample.call(context, false);
    expect(context.exampleOpen).toBe(false);
    ticks.shift()();
    expect(events.at(-1)).toEqual(['update:visible', true]);
});

it('scans unknown tags asynchronously in chunks with progress and cancellation', async () => {
    const engine = new AIEngine({ sourceLang: 'ja', targetLang: 'en' });
    const cache = new Map();
    for (let i = 0; i < 12; i++) {
        cache.set(`message:ja-en-Line ${i} \\ZZ[${i}]`, '');
    }

    const progressUpdates = [];
    const asyncResults = await engine.scanForUnknownTagsAsync(cache, {
        chunkBudgetMs: 0,
        minChunkItems: 3,
        onProgress: (info) => progressUpdates.push(info),
    });

    expect(asyncResults).toEqual(engine.scanForUnknownTags(cache));
    expect(progressUpdates.length).toBeGreaterThan(1);
    expect(progressUpdates.at(-1)).toEqual({ processed: 12, total: 12 });

    const cancelled = await engine.scanForUnknownTagsAsync(cache, {
        chunkBudgetMs: 0,
        minChunkItems: 2,
        isCancelled: () => true,
    });
    expect(cancelled).toBeNull();
});

it('sets isScanning spinner state while UnknownTagsModal.scanCache runs asynchronously', async () => {
    let resolveScan;
    const scanPromise = new Promise((resolve) => {
        resolveScan = resolve;
    });
    const scanForUnknownTagsAsync = vi.fn(() => scanPromise);
    const context = {
        ...UnknownTagsModal.data(),
        runtime: {
            translationCache: new Map([['message:ja-en-Test \\ZZ[1]', '']]),
            engine: { scanForUnknownTagsAsync },
        },
    };

    const run = UnknownTagsModal.methods.scanCache.call(context);
    expect(context.isScanning).toBe(true);
    expect(context.scanTotalCount).toBe(1);

    resolveScan([{ pattern: String.raw`\ZZ[N]`, count: 1, exampleKeys: ['message:ja-en-Test \\ZZ[1]'] }]);
    await run;

    expect(scanForUnknownTagsAsync).toHaveBeenCalledOnce();
    expect(context.isScanning).toBe(false);
    expect(context.unknownTagsList).toHaveLength(1);
});
