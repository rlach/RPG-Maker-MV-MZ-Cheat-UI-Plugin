import { afterEach, describe, expect, it } from 'vitest';

import { Koharu } from '../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/Koharu.js';
import { OtherStrings } from '../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/OtherStrings.js';

function createRuntimeStub(entries = []) {
    return {
        sourceLang: 'ja',
        targetLang: 'en',
        translationCache: new Map(entries),
        getCacheKey(text, type) {
            return `${type}:${this.sourceLang}-${this.targetLang}-${text}`;
        },
    };
}

describe('Koharu phase', () => {
    afterEach(() => {
        delete globalThis.$dataSystem;
        delete globalThis.Utils;
        Koharu._instance = null;
        OtherStrings._instance = null;
    });

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

    it('builds project id from translated game title when available in cache', () => {
        globalThis.$dataSystem = { gameTitle: 'Original Game' };
        globalThis.Utils = { RPGMAKER_NAME: 'MZ' };

        const runtime = createRuntimeStub([['other:ja-en-Original Game', 'Translated Title']]);

        const strategy = Koharu.getInstance();
        const projectId = strategy.buildProjectId({
            runtime,
            targetLanguage: 'ko',
            timestamp: 123,
        });

        expect(projectId).toBe('Translated-Title-ko-123');
    });

    it('falls back to original game title when translated title is missing', () => {
        globalThis.$dataSystem = { gameTitle: 'Original Game' };
        globalThis.Utils = { RPGMAKER_NAME: 'MZ' };

        const runtime = createRuntimeStub();

        const strategy = Koharu.getInstance();
        const projectId = strategy.buildProjectId({
            runtime,
            targetLanguage: 'en',
            timestamp: 123,
        });

        expect(projectId).toBe('Original-Game-en-123');
    });

    it('falls back to engine-specific default when game title is empty', () => {
        globalThis.$dataSystem = { gameTitle: '' };

        const runtime = createRuntimeStub();
        const strategy = Koharu.getInstance();

        globalThis.Utils = { RPGMAKER_NAME: 'MZ' };
        expect(strategy.buildProjectId({ runtime, targetLanguage: 'en', timestamp: 123 })).toBe(
            'rpmMZ-en-123'
        );

        globalThis.Utils = { RPGMAKER_NAME: 'MV' };
        expect(strategy.buildProjectId({ runtime, targetLanguage: 'en', timestamp: 123 })).toBe(
            'rpmMV-en-123'
        );
    });
});
