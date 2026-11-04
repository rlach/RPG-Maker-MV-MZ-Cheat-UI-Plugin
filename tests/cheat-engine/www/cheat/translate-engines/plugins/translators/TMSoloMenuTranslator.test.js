import { afterEach, expect, it, vi } from 'vitest';
import { TMSoloMenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TMSoloMenuTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('collects literal assignments only for variables displayed by the solo menu', () => {
    const translator = new TMSoloMenuTranslator();
    const entries = [];
    translator.collectVariableAssignments(
        [
            { code: 122, parameters: [1, 1, 0, 4, "'紹介文'"] },
            { code: 122, parameters: [2, 2, 0, 4, "'無関係'"] },
            { code: 122, parameters: [1, 1, 0, 4, 'dangerousCall()'] },
            { code: 122, parameters: [1, 1, 1, 4, "'加算'"] },
        ],
        new Set([1]),
        entries
    );
    expect(entries.map((entry) => entry.text)).toEqual(['紹介文']);
});

it('translates profile variable text in the menu without modifying variables or parameter objects', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$gameVariables', { value: () => '紹介文' });
    const translator = new TMSoloMenuTranslator();
    translator._scanPrepared = true;
    translator._scanEntries = [{ text: '紹介文' }];
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([['plugin_tm_solo_menu:紹介文', 'Character biography']]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    const status = {
        drawSoloParameter: (_actor, _code, parameter) => parameter.name,
        drawBattleParameter() {},
        drawActorLevelAndExp() {},
    };
    translator.patchSoloStatusWindowInstance(status);
    const parameter = Object.freeze({ name: '\\C[0]\\}\\V[1]' });
    expect(status.drawSoloParameter(null, 'TEXT', parameter)).toBe('\\C[0]\\}Character biography');
    expect(window.$gameVariables.value(1)).toBe('紹介文');
    runtime.enabled = false;
    expect(status.drawSoloParameter(null, 'TEXT', parameter)).toBe(parameter.name);
});
