import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TagManager } from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
import AIEngine from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
import {
    detectTranslationSuspicions,
    isCutOffTranslation,
} from '../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TranslationSuspicions.js';
import { TranslationSuspicionStore } from '../../../../../../cheat-engine/www/cheat/js/TranslationSuspicionStore.js';
import { ConfirmDialog } from '../../../../../../cheat-engine/www/cheat/js/DialogHelper.js';

const manager = () => new TagManager(null);
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('tag consistency modes', () => {
    it.each(['tags', 'legacy'])(
        'allows missing actor names but rejects additional occurrences in %s syntax',
        (format) => {
            const tags = manager();
            tags.setTagFormat(format);
            const input = tags.preprocessTags('\\N[1]です。\\N[1]です。');
            const token = tags.syntax.tokens(input.preprocessedText)[0];
            const encoded = input.preprocessedText.slice(token.index, token.end);
            const missing = tags.postprocessTags(
                encoded + ' speaks.',
                input.tagCounts,
                input.caseMap
            );
            expect(missing.valid).toBe(true);
            expect(missing.suspicions[0].label).toBe('Missing \\N[N] tag');
            expect(
                tags.postprocessTags(encoded.repeat(3), input.tagCounts, input.caseMap).valid
            ).toBe(false);
        }
    );

    it.each([
        ['none', true, 0],
        ['full', false, 0],
        ['missing', false, 1],
        ['any', true, 1],
    ])('handles added occurrences under %s', (consistencyMode, valid, count) => {
        const tags = manager();
        tags.setBaseTagConfigs([
            {
                description: 'Example',
                tagSymbol: 'X',
                type: 'withoutParameter',
                requiredConsistency: false,
                consistencyMode,
            },
        ]);
        const input = tags.preprocessTags('\\X hello');
        const result = tags.postprocessTags(
            input.preprocessedText.repeat(2),
            input.tagCounts,
            input.caseMap
        );
        expect(result.valid).toBe(valid);
        expect(result.suspicions).toHaveLength(count);
    });

    it('retains old boolean override behavior over the new actor-name default', () => {
        const engine = new AIEngine({});
        const actor = engine.getDefaultTagConfigsForUi().find((tag) => tag.tagSymbol === 'N');
        engine.setOverrides(actor, 'default', '', { requiredConsistency: true });
        expect(engine.applyTagOverrides(actor).consistencyMode).toBe('full');
        engine.setOverrides(actor, 'default', '', { requiredConsistency: false });
        expect(engine.applyTagOverrides(actor).consistencyMode).toBe('none');
        engine.setOverrides(actor, 'default', '', { consistencyMode: 'any' });
        expect(engine.applyTagOverrides(actor).consistencyMode).toBe('any');
    });
});

it.each(['⟪', 'TAG:', '⟫', '\\N<⟪TAG:wa5>'])(
    'rejects transport fragments including nested name fragments %s',
    (part) => {
        const tags = manager();
        const input = tags.preprocessTags('\\N[5]こんにちは。');
        const result = tags.postprocessTags(`Text ${part}`, input.tagCounts, input.caseMap);
        expect(result.valid).toBe(false);
        expect(result.errorReason).toContain('Unresolved encoded');
    }
);
it.each(['{', '}', '[', ']'])('flags a JSON fragment %s', (part) => {
    expect(
        detectTranslationSuspicions('原文', `Text ${part}`, manager()).map((r) => r.id)
    ).toContain('json-parts');
});

it('excludes real formatting and name tags from bracket detection', () => {
    expect(detectTranslationSuspicions('原文', '\\{Hello\\} \\N[1] \\C[2]text', manager())).toEqual(
        []
    );
});

it.each(['終わり。', '終わり！', '終わり？', '終わり……', '「終わり。」'])(
    'treats a missing terminal punctuation mark for %s as a hard cut-off rejection instead of a suspicion',
    (source) => {
        expect(isCutOffTranslation(source, 'The end', manager())).toBe(true);
        expect(detectTranslationSuspicions(source, 'The end', manager()).map((r) => r.id)).not.toContain(
            'cut-off-text'
        );
    }
);

it('rejects cut-off translations in AIEngine.batchTranslate instead of marking them suspicious', async () => {
    vi.stubGlobal('window', globalThis);
    const engine = new AIEngine({
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map(),
        cleanTranslatedText: (text) => text,
        wrapText: (text) => text,
    });
    engine.selectedModel = 'test-model';
    engine.askAiIfTextTranslated = false;
    vi.spyOn(engine.tagManager, 'buildNameHints').mockReturnValue('');
    vi.spyOn(engine, 'requestChatCompletion').mockImplementation(async (payload) => {
        const content = payload.messages.findLast((message) => message.role === 'user').content;
        const keys = Object.keys(JSON.parse(content.slice(content.indexOf('{'))));
        return { text: JSON.stringify({ [keys[0]]: 'The end' }) };
    });
    const result = await engine.batchTranslate([
        { type: 'message', id: '0', value: '終わり。', cacheKey: 'message:ja-en-終わり。' },
    ]);
    expect(result.successes).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].rejectReason).toBe('Cut off text');
});

it('counts Japanese and English sentence endings and ignores decimal separators', () => {
    expect(
        detectTranslationSuspicions('一つ。二つ！三つ？', 'One. Two!', manager()).map((r) => r.id)
    ).toContain('fewer-sentences');
    expect(detectTranslationSuspicions('3.14です。', 'It is 3.14.', manager())).toEqual([]);
});

it.each(['E?', 'E...!?', '「え……！？」', '𠮷⋯！？'])(
    'ignores a one-character surplus sentence %s',
    (interjection) => {
        expect(
            detectTranslationSuspicions(
                `${interjection} This is bullshit!`,
                'To kompletne szaleństwo!',
                manager()
            ).map((r) => r.id)
        ).not.toContain('fewer-sentences');
    }
);

it('ignores several one-character sentences even when their combined length exceeds five percent', () => {
    expect(
        detectTranslationSuspicions(
            'A! B? C... ' + 'x'.repeat(47) + '.',
            'Translated sentence.',
            manager()
        ).map((r) => r.id)
    ).not.toContain('fewer-sentences');
});

it.each([38, 39, 100])(
    'ignores surplus content at or below five percent with %s main characters',
    (length) => {
        expect(
            detectTranslationSuspicions(
                'ab... ' + 'x'.repeat(length) + '.',
                'Translated sentence.',
                manager()
            ).map((r) => r.id)
        ).not.toContain('fewer-sentences');
    }
);

it('still flags missing content above five percent after ignoring single-character sentences', () => {
    expect(
        detectTranslationSuspicions(
            'E!? abc... ' + 'x'.repeat(36) + '.',
            'Translated sentence.',
            manager()
        ).map((r) => r.id)
    ).toContain('fewer-sentences');
});

it('combines multiple significant surplus sentences for the five-percent threshold', () => {
    expect(
        detectTranslationSuspicions(
            'ab! cd? ' + 'x'.repeat(66) + '.',
            'Translated sentence.',
            manager()
        ).map((r) => r.id)
    ).toContain('fewer-sentences');
});

it('does not let punctuation and whitespace inflate the length allowance', () => {
    expect(
        detectTranslationSuspicions(
            'abc...!? ' + ' '.repeat(100) + 'x'.repeat(20) + '!!!',
            'Translated sentence.',
            manager()
        ).map((r) => r.id)
    ).toContain('fewer-sentences');
});

it('persists reasons separately and preserves acceptance across reloads and language pairs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'translation-suspicions-'));
    try {
        const file = join(dir, 'suspicions.json');
        const store = new TranslationSuspicionStore(fs, file);
        const reason = { id: 'partial-tags', label: 'Partial tags', message: 'Encoded fragment.' };
        store.set('message:ja-en-Hello', [reason]);
        store.set('message:ja-pl-Hello', [reason]);
        store.save();
        const reloaded = new TranslationSuspicionStore(fs, file);
        expect(reloaded.get('message:ja-en-Hello')).toEqual([reason]);
        reloaded.set('message:ja-en-Hello', []);
        reloaded.save();
        const accepted = new TranslationSuspicionStore(fs, file);
        expect(accepted.get('message:ja-en-Hello')).toEqual([]);
        expect(accepted.get('message:ja-pl-Hello')).toEqual([reason]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

it('combines all filters for bulk acceptance and requires confirmation', async () => {
    vi.stubGlobal('window', globalThis);
    const { default: Panel } =
        await import('../../../../../../cheat-engine/www/cheat/panels/TranslateCacheManagerPanel.js');
    const reason = { id: 'partial-tags', label: 'Partial tags', message: 'Encoded fragment.' };
    const panel = {
        ...Panel.methods,
        entries: [
            {
                key: 'a',
                type: 'message',
                original: 'foobar',
                translation: 'A',
                suspicions: [reason],
            },
            {
                key: 'b',
                type: 'message',
                original: 'foobar two',
                translation: 'B',
                suspicions: [reason],
            },
            { key: 'c', type: 'item', original: 'foobar', translation: 'C', suspicions: [reason] },
            {
                key: 'd',
                type: 'message',
                original: 'other',
                translation: 'D',
                suspicions: [reason],
            },
            { key: 'e', type: 'message', original: 'foobar', translation: 'E', suspicions: [] },
        ],
        searchInput: 'foobar',
        selectedTypeFilter: 'message',
        searchIn: 'original',
        suspicionFilter: 'partial-tags',
        onlyEmpty: false,
        acceptSuspicions: vi.fn(),
    };
    const show = vi.spyOn(ConfirmDialog, 'show');
    panel.confirmAcceptMatchingSuspicions();
    expect(panel.acceptSuspicions).not.toHaveBeenCalled();
    const options = show.mock.calls[0][0];
    expect(options.message).toContain('2 translations');
    options.actions[1].action();
    expect(panel.acceptSuspicions).toHaveBeenCalledWith(['a', 'b']);
    expect(Panel.computed.suspicionFilterOptions.call(panel).map((option) => option.value)).toEqual(
        ['any', 'only', 'partial-tags']
    );
});

it('does not attach stale suspicions to a different persisted translation', () => {
    const store = new TranslationSuspicionStore({ existsSync: () => false }, '/unused');
    store.set(
        'key',
        [{ id: 'cut-off-text', label: 'Cut off text', message: 'Incomplete.' }],
        'Old text'
    );
    expect(store.get('key', 'Old text')).toHaveLength(1);
    expect(store.get('key', 'New text')).toEqual([]);
});

it('preserves suspicions when harvesting a placeholder over an existing translation', async () => {
    const { translateOnTheFlyCoreMethods } =
        await import('../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyCoreMethods.js');
    const store = new TranslationSuspicionStore({ existsSync: () => false }, '/unused');
    const key = 'message:ja-en-source';
    const reason = { id: 'cut-off-text', label: 'Cut off text', message: 'Incomplete.' };
    store.set(key, [reason], 'Text');
    const runtime = {
        ...translateOnTheFlyCoreMethods,
        translationCache: new Map([[key, 'Text']]),
        translationSuspicionStore: store,
        normalizeCacheValue: (value) => value,
        resolveCommandCacheWriteKey: (value) => value,
        isTranslatedCacheValue: (value) => !!value,
        updateReverseCommandLookup() {},
        rememberCacheBucketForKey() {},
        notifyCacheRuntime() {},
    };
    runtime.setCacheValue(key, '', { persist: false });
    expect(runtime.getTranslationSuspicions(key)).toEqual([reason]);
    runtime.setCacheValue(key, 'Text', { persist: false });
    expect(runtime.getTranslationSuspicions(key)).toEqual([reason]);
    runtime.setCacheValue(key, 'Complete text.', { persist: false });
    expect(runtime.getTranslationSuspicions(key)).toEqual([]);
    runtime.setCacheValue(key, 'New incomplete', { persist: false, suspicions: [reason] });
    expect(runtime.getTranslationSuspicions(key)).toEqual([reason]);
});

it('accepts unchanged recipe brackets and detects an added closing brace', () => {
    const recipe =
        '<recipe>\n"material": [["item", 2, 3], ["item", 5, 4], ["item", 6, 1]],\n"target": ["item", 8]\n</recipe>';
    expect(
        detectTranslationSuspicions(recipe, recipe, manager()).map((reason) => reason.id)
    ).not.toContain('json-parts');
    expect(
        detectTranslationSuspicions('「薬を作る。」', '"I will make medicine."}', manager()).map(
            (reason) => reason.id
        )
    ).toContain('json-parts');
});

it.each(['{', '}', '[', ']'])('permits the original count or fewer occurrences of %s', (part) => {
    const source = `Original ${part}${part}`;
    for (const output of [`Translated ${part}${part}`, `Translated ${part}`, 'Translated']) {
        expect(
            detectTranslationSuspicions(source, output, manager()).map((reason) => reason.id)
        ).not.toContain('json-parts');
    }
    expect(
        detectTranslationSuspicions(source, `Translated ${part}${part}${part}`, manager()).map(
            (reason) => reason.id
        )
    ).toContain('json-parts');
});

it('compares bracket types separately after excluding actual game tags', () => {
    expect(
        detectTranslationSuspicions('Original [value]', 'Translated {value}', manager()).map(
            (reason) => reason.id
        )
    ).toContain('json-parts');
    expect(
        detectTranslationSuspicions('\\N[1]です', 'Name [new text]', manager()).map(
            (reason) => reason.id
        )
    ).toContain('json-parts');
});

it('flags translations identical to the original text as Identical translation', () => {
    expect(detectTranslationSuspicions('HP', 'HP', manager())).toEqual([
        expect.objectContaining({
            id: 'identical-translation',
            label: 'Identical translation',
        }),
    ]);
    expect(detectTranslationSuspicions('原文です。', '  原文です。 ', manager()).map((r) => r.id)).toContain(
        'identical-translation'
    );
    expect(detectTranslationSuspicions('原文です。', 'Original text.', manager())).toEqual([]);
    expect(detectTranslationSuspicions('', '', manager())).toEqual([]);
});

it('excludes numbers, special characters, and masked/non-translatable tags from Identical translation', () => {
    const tm = manager();
    tm.setCustomTagConfigs([
        {
            description: 'Masked SE tag',
            tagSymbol: 'SE',
            type: 'withCustomParameter',
            style: 'escape',
            bracket: '[',
            maskValue: true,
            requiredConsistency: true,
        },
        {
            description: 'Unmasked speaker tag',
            tagSymbol: 'NAME',
            type: 'withCustomParameter',
            style: 'escape',
            bracket: '<',
            maskValue: false,
            requiredConsistency: true,
        },
    ]);

    const excludedCases = [
        '123',
        '0 / 100',
        '100%',
        '！？……',
        '---',
        '\\I[57]\\C[6]\\V[331]',
        '\\V[1] / \\V[2]',
        '\\SE[bgm_battle_01]',
        '\\C[2]\\SE[bgm_battle_01] 100%!',
        '\\NAME<123>',
    ];
    for (const sample of excludedCases) {
        expect(
            detectTranslationSuspicions(sample, sample, tm).map((r) => r.id),
            sample
        ).not.toContain('identical-translation');
    }

    // Real text and unmasked custom tag values with letters must still be flagged.
    for (const flaggedSample of ['\\SE[bgm_01] こんにちは', '\\NAME<しえる>', '\\C[6]HP\\C[0]']) {
        expect(
            detectTranslationSuspicions(flaggedSample, flaggedSample, tm).map((r) => r.id),
            flaggedSample
        ).toContain('identical-translation');
    }
});

it('flags foreign CJK characters when translating from Japanese/Korean/Chinese to a different script', () => {
    expect(
        detectTranslationSuspicions('これは私の猫です。', 'This is my の cat.', manager(), {
            sourceLang: 'ja',
            targetLang: 'en',
        })
    ).toEqual([
        expect.objectContaining({
            id: 'foreign-characters',
            label: 'Foreign characters',
            message: expect.stringContaining('の'),
        }),
    ]);

    expect(
        detectTranslationSuspicions('이것은 고양이입니다.', 'This is a 고양이.', manager(), {
            sourceLang: 'ko',
            targetLang: 'pl',
        }).map((r) => r.id)
    ).toContain('foreign-characters');

    expect(
        detectTranslationSuspicions('这是我的猫。', 'This is my 猫.', manager(), {
            sourceLang: 'zh-CN',
            targetLang: 'en',
        }).map((r) => r.id)
    ).toContain('foreign-characters');

    // Clean translation has no foreign-characters suspicion.
    expect(
        detectTranslationSuspicions('これは私の猫です。', 'This is my cat.', manager(), {
            sourceLang: 'ja',
            targetLang: 'en',
        })
    ).toEqual([]);

    // Non-CJK source languages do not trigger this check.
    expect(
        detectTranslationSuspicions('This is a cat.', 'To jest の kot.', manager(), {
            sourceLang: 'en',
            targetLang: 'pl',
        }).map((r) => r.id)
    ).not.toContain('foreign-characters');

    // Same-script CJK pair (e.g. Simplified -> Traditional Chinese) does not trigger on Han characters.
    expect(
        detectTranslationSuspicions('这是我的猫。', '這是我的貓。', manager(), {
            sourceLang: 'zh-CN',
            targetLang: 'zh-TW',
        }).map((r) => r.id)
    ).not.toContain('foreign-characters');
});

it('accepts a single filtered suspicion and ignores an empty result', async () => {
    vi.stubGlobal('window', globalThis);
    const { default: Panel } = await import('../../../../../../cheat-engine/www/cheat/panels/TranslateCacheManagerPanel.js');
    const show = vi.spyOn(ConfirmDialog, 'show');
    const panel = {
        suspicionFilter: 'partial-tags', searchInput: '', selectedTypeFilter: 'message',
        getEntriesMatchingFilter: vi.fn(() => [{ key: 'single' }]),
        acceptSuspicions: vi.fn(),
    };
    Panel.methods.confirmAcceptMatchingSuspicions.call(panel);
    const options = show.mock.calls[0][0];
    options.actions[1].action();
    expect(panel.acceptSuspicions).toHaveBeenCalledWith(['single']);
    show.mockClear();
    panel.getEntriesMatchingFilter.mockReturnValue([]);
    Panel.methods.confirmAcceptMatchingSuspicions.call(panel);
    expect(show).not.toHaveBeenCalled();
});
