import { afterEach, expect, it, vi } from 'vitest';
import { RirikaManagementUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/RirikaManagementUiTranslator.js';
import { SourceTextCatalogTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('scans vocabulary, staff profiles and formatted counters without changing source tables', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal(
        '$plugins',
        ['StaffList', 'Satsuei', 'RankingParams', 'ActorParam', 'vocab'].map((name) => ({
            name,
            status: true,
            parameters: {},
        }))
    );
    const source = `TextManager.weekAndDay = '%1週%2日目';
        TextManager.rankingNum = '%1位';
        TextManager.skill = 'このスキルは売春時に自動的に発動する';
        var ACTOR_MAP = { 1: { name: '太郎', profile: '俳優の紹介' } };
        function draw() { this.contents.drawText('雇用男優数 %1/%2'.format(n, max)); }`;
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, text: async () => source }))
    );
    const translator = new RirikaManagementUiTranslator();
    expect(translator.detectPlugin()).toBe(true);
    await translator.precomputeCounts();
    const translations = new Map([
        ['\\COT[0]週\\COT[1]日目', 'Week \\COT[0], day \\COT[1]'],
        ['\\COT[0]位', 'Rank \\COT[0]'],
        ['雇用男優数 \\COT[0]/\\COT[1]', 'Hired actors \\COT[0]/\\COT[1]'],
        ['太郎', 'Taro'],
    ]);
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (key) => translations.has(key),
        translationCache: translations,
    };
    expect(translator.entries.has('俳優の紹介')).toBe(true);
    expect(translator.resolveText('28週4日目', runtime)).toBe('Week 28, day 4');
    expect(translator.resolveText('16位', runtime)).toBe('Rank 16');
    expect(translator.resolveText('雇用男優数 13/13', runtime)).toBe('Hired actors 13/13');
    expect(translator.resolveText('太郎', runtime)).toBe('Taro');
    expect(translator.entries.has('28週4日目')).toBe(false);
    expect(translator.resolveText('28週4日目', { isTranslationEnabled: () => false })).toBe(
        '28週4日目'
    );
    expect(source).toContain("name: '太郎'");
});

it('translates reassigned actor names at escape expansion while preserving actor identity', () => {
    vi.stubGlobal('window', globalThis);
    let currentName = '太郎';
    class Base {
        actorName() {
            return currentName;
        }
    }
    vi.stubGlobal('Window_Base', Base);
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(
        true
    );
    const translator = new RirikaManagementUiTranslator();
    const translations = new Map([
        ['actor_name:太郎', 'Taro'],
        ['plugin_ririka_management_ui:次郎', 'Jiro'],
    ]);
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => type + ':' + text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (key) => translations.has(key),
        translationCache: translations,
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(new Base().actorName(14)).toBe('Taro');
    expect(currentName).toBe('太郎');
    currentName = '次郎';
    expect(new Base().actorName(14)).toBe('Jiro');
    runtime.enabled = false;
    expect(new Base().actorName(14)).toBe('次郎');
});
