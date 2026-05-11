import { describe, expect, it } from 'vitest';

import { Koharu } from '../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/Koharu.js';

function createRuntimeStub(entries = []) {
    return {
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map(entries),
    };
}

describe('Koharu phase', () => {
    it('collects only empty koharu cache entries for active language pair', () => {
        const runtime = createRuntimeStub([
            ['koharu:ja-en-< test', ''],
            ['koharu:ja-en-Already done', 'Translated'],
            ['message:ja-en-Dialog', ''],
            ['koharu:ja-ko-Other pair', ''],
            ['koharu:ja-en-   ', ''],
        ]);

        const strategy = Koharu.getInstance();
        const pending = strategy.collectUntranslated({ runtime });

        expect(pending).toHaveLength(1);
        expect(pending[0]).toMatchObject({
            type: 'koharu',
            value: '< test',
            cacheKey: 'koharu:ja-en-< test',
        });
    });

    it('reports total and untranslated koharu keys separately', () => {
        const runtime = createRuntimeStub([
            ['koharu:ja-en-A', ''],
            ['koharu:ja-en-B', 'Translated'],
        ]);

        const strategy = Koharu.getInstance();
        const stats = strategy.countAmountSync({ runtime });

        expect(stats).toEqual({
            total: 2,
            left: 1,
            totalStrings: 2,
            leftStrings: 1,
        });
    });
});
