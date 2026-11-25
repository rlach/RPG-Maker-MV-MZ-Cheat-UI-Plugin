import { it, expect, vi, afterEach } from 'vitest';
import { WdmzPartyChangeTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/WdmzPartyChangeTranslator.js';
import { TmGoldLevelUpTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/TmGoldLevelUpTranslator.js';
import { CommonEvents } from '../cheat-engine/www/cheat/translate-engines/translation-phases/CommonEvents.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('collects MZ gold-level labels and party captions and resolves repeated output without new source keys', async () => {
    vi.stubGlobal('window', globalThis);
    const plugins = [
        {
            name: 'TMGoldLevelUpMZ',
            status: true,
            parameters: {
                currentGold: '資金',
                learnSkill: '覚えるスキル',
                execLevelUpText: 'レベルアップする',
                cancelLevelUpText: 'キャンセル',
            },
        },
        { name: 'WDmzPartyChange', status: true, parameters: {} },
    ];
    vi.stubGlobal('$plugins', plugins);
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => 'var wd_text1_mess="パーティリスト";var wd_text2_mess="メンバーリスト";',
    }));
    const party = new WdmzPartyChangeTranslator();
    await party.precomputeCounts();
    expect(party.entries.has('メンバーリスト')).toBe(true);
    const gold = new TmGoldLevelUpTranslator();
    await gold.precomputeCounts();
    for (const text of ['資金', '覚えるスキル', 'レベルアップする', 'キャンセル'])
        expect(gold.entries.has(text)).toBe(true);
    const rt = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags() {} },
        getCacheKey: (s, c) => c + ':' + s,
        translationCache: new Map([['plugin_wdmz_party_change:パーティリスト', 'Party list']]),
        hasUsableCacheValue(k) {
            return this.translationCache.has(k);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    for (let i = 0; i < 3; i++) {
        expect(party.resolveText('パーティリスト', rt)).toBe('Party list');
        expect(party.resolveText('Party list', rt)).toBe('Party list');
    }
    expect(
        rt.trackCacheKeyUsage.mock.calls.every(
            ([k]) => k === 'plugin_wdmz_party_change:パーティリスト'
        )
    ).toBe(true);
    rt.enabled = false;
    expect(party.resolveText('パーティリスト', rt)).toBe('パーティリスト');
});
it('collects common-event batch keys from original files instead of expanded or translated live data', async () => {
    vi.stubGlobal('window', globalThis);
    const list = (text) => [
        { code: 101, parameters: ['', 0, 0, 2] },
        { code: 401, parameters: [text] },
    ];
    vi.stubGlobal('$dataCommonEvents', [null, { list: list('Already translated display') }]);
    const original = String.raw`\N[30]の柔らかな反応が`;
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => JSON.stringify([null, { list: list(original) }]),
    }));
    const t = new CommonEvents();
    const [{ strategy }] = await t.createEntries();
    const rt = { getCacheKey: (s, c) => c + ':' + s, hasUsableCacheValue: () => false };
    expect(strategy.collectUntranslated({ runtime: rt }).some((e) => e.value === original)).toBe(
        true
    );
    expect(
        strategy
            .collectUntranslated({ runtime: rt })
            .some((e) => e.value === 'Already translated display')
    ).toBe(false);
});
