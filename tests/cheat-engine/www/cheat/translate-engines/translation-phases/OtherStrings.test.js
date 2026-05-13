import { afterEach, describe, expect, it } from 'vitest';

import { OtherStrings } from '../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/OtherStrings.js';

describe('OtherStrings', () => {
    afterEach(() => {
        delete globalThis.$dataSystem;
        OtherStrings._instance = null;
    });

    it('exposes getTitleOriginalValue and returns game title', () => {
        globalThis.$dataSystem = { gameTitle: 'Sample Title' };

        const strategy = OtherStrings.getInstance();
        expect(strategy.getTitleOriginalValue()).toBe('Sample Title');
    });
});
