import { expect, it, vi } from 'vitest';
vi.hoisted(() => {
    globalThis.window = {};
});
import { BOXING_SERVICE } from '../../../../../cheat-engine/www/cheat/components/BoxingModal.js';
import { wrapTextByVisibleWidth } from '../../../../../cheat-engine/www/cheat/js/translation-runtime/TextWrap.js';
import { DescriptionsCleanup } from '../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/DescriptionsCleanup.js';

it('reflows old description lines and reapplies the cache to game data', () => {
    const key = 'item_description:ja-en-source';
    const runtime = {
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map([[key, 'First line\nsecond line\nthird line']]),
        cleanTranslatedText: (text) => text,
        wrapText: wrapTextByVisibleWidth,
        setCacheValue: vi.fn((key, value) => runtime.translationCache.set(key, value)),
        applyCachedTranslationsToData: vi.fn(),
        persistCache: vi.fn(),
        notifyCacheRuntime: vi.fn(),
        notify: vi.fn(),
    };
    BOXING_SERVICE.runLocalReformat(runtime, ['item_description'], {
        descriptionMaxLineWidth: 120,
        removeNewlinesBeforeWrappingMaxCount: 0,
    });
    expect(runtime.translationCache.get(key)).toBe('First line second line third line');
    expect(runtime.applyCachedTranslationsToData).toHaveBeenCalledOnce();
});

it('materializes successful LLM boxing while retaining failed translations', () => {
    const runtime = { setCacheValue: vi.fn(), applyCachedTranslationsToData: vi.fn() };
    const phase = new DescriptionsCleanup();
    phase.setData({
        runtime,
        successes: [{ cacheKey: 'item_description:ja-en-source', translated: 'Reformatted' }],
    });
    phase.finalizePhase({ runtime });
    expect(runtime.setCacheValue).toHaveBeenCalledWith(
        'item_description:ja-en-source',
        'Reformatted'
    );
    expect(runtime.applyCachedTranslationsToData).toHaveBeenCalledOnce();
});
