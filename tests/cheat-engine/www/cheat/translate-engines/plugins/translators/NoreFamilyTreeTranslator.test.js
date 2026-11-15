import { afterEach, expect, it, vi } from 'vitest';
import { NoreFamilyTreeTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NoreFamilyTreeTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('extracts only displayed names and complete child labels, including special names', () => {
    const t = new NoreFamilyTreeTranslator();
    const catalog = t.collectSourceCatalog(
        'var TANEOYA_MAP = { 216: ["internal", "スタリオン"], 221: ["internal2", "ローパー", "ローパーの幼体"] };'
    );
    expect(catalog.entries.map((entry) => entry.text)).toEqual([
        'スタリオン',
        'スタリオンの子',
        'ローパー',
        'ローパーの幼体',
    ]);
});
it('translates fresh source labels without mutating the name table or harvesting output', () => {
    const names = { 216: ['internal', 'スタリオン'] };
    vi.stubGlobal('window', {
        getTaneoyaName: (id) => names[id][1],
        getBabyName: (id) => names[id][1] + 'の子',
    });
    const t = new NoreFamilyTreeTranslator();
    let enabled = true;
    const r = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => true,
        translationCache: new Map([
            ['スタリオン', 'Stallion'],
            ['スタリオンの子', 'Stallion Child'],
        ]),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    for (let i = 0; i < 2; i++) {
        expect(window.getTaneoyaName(216)).toBe('Stallion');
        expect(window.getBabyName(216)).toBe('Stallion Child');
    }
    expect(names[216][1]).toBe('スタリオン');
    expect(r.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual([
        'スタリオン',
        'スタリオンの子',
        'スタリオン',
        'スタリオンの子',
    ]);
    enabled = false;
    expect(window.getBabyName(216)).toBe('スタリオンの子');
});
