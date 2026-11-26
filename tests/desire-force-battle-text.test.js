import { afterEach, expect, it, vi } from 'vitest';
import { OnlyOneBattleStatusTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/OnlyOneBattleStatusTranslator.js';
import { SourceTextCatalogTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
import { withVariableDisplayContext } from '../cheat-engine/www/cheat/js/translation-runtime/VariableDisplayContext.js';
import { buildMessageCacheLookupKeys } from '../cheat-engine/www/cheat/js/MessageCacheKeyHelper.js';
import { Troops } from '../cheat-engine/www/cheat/translate-engines/translation-phases/Troops.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function runtime() {
    return { enabled: true, isTranslationEnabled() { return this.enabled; }, engine: {},
        getCacheKey: (text, type) => `${type}:${text}`, translationCache: new Map(),
        hasUsableCacheValue(key) { return !!this.translationCache.get(key); },
        trackCacheKeyUsage: vi.fn(), getRawGameVariableValue: () => 'ウインド' };
}

it('collects original card tabs and event-installed commands without scanning message sources twice', async () => {
    vi.stubGlobal('window', { $plugins: [{ name: 'OnlyOneBattleStatus', status: true, parameters: {} }] });
    const common = [null, { list: [{ code: 355, parameters: ['Window_ActorCommand.prototype.addItemCommand=function(){'] },
        { code: 655, parameters: ['this.addCommand("カード", "item");};'] },
        { code: 122, parameters: [54, 54, 0, 4, '$dataItems[$gameVariables.value(51)].name;'] },
        { code: 401, parameters: ['普通の会話'] }] }];
    vi.stubGlobal('fetch', vi.fn(async (url) => ({ ok: true,
        text: async () => 'function draw(n){bitmap.drawText(`手札 (${n})`);bitmap.drawText("融合を中断しますか？");}',
        json: async () => common })));
    const translator = new OnlyOneBattleStatusTranslator();
    await translator.precomputeCounts();
    expect(translator.entries.has('手札 (\\COT[0])')).toBe(true);
    expect(translator.entries.has('カード')).toBe(true);
    expect(translator.entries.has('普通の会話')).toBe(false);
    expect([...translator.cardNameVariableIds]).toEqual([54]);
    const rt = runtime(); translator.getRuntime = () => rt;
    translator.tagEngine = rt.engine;
    rt.translationCache.set('plugin_only_one_battle_status:手札 (\\COT[0])', 'Hand (\\COT[0])');
    expect(translator.resolveText('手札 (6)', rt)).toBe('Hand (6)');
    const tracked = rt.trackCacheKeyUsage.mock.calls.length;
    expect(translator.resolveText('Hand (6)', rt)).toBe('Hand (6)');
    expect(rt.trackCacheKeyUsage.mock.calls).toHaveLength(tracked);
});

it('uses item-name translations for the Got display without changing variable logic or harvesting translated output', () => {
    class Variables { value() { return this.raw ?? 'ウインド'; } }
    const root = { Game_Variables: Variables };
    vi.stubGlobal('window', root);
    const translator = new OnlyOneBattleStatusTranslator();
    expect(translator.enablePluginTranslation()).toBe(false);
    Variables.prototype._translateOriginalValue = Variables.prototype.value;
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(true);
    const rt = runtime(); translator.getRuntime = () => rt;
    rt.translationCache.set('item_name:ウインド', 'Wind');
    translator.cardNameVariableIds.add(54);
    expect(translator.enablePluginTranslation()).toBe(true);
    const variables = new Variables();
    expect(variables.value(54)).toBe('ウインド');
    for (let i = 0; i < 3; i++) expect(withVariableDisplayContext(() => variables.value(54))).toBe('Wind');
    expect(rt.trackCacheKeyUsage.mock.calls.every(([key]) => key === 'item_name:ウインド')).toBe(true);
    expect(withVariableDisplayContext(() => variables.value(55))).toBe('ウインド');
    variables.raw = 'Wind'; rt.getRawGameVariableValue = () => 'Wind';
    const tracked = rt.trackCacheKeyUsage.mock.calls.length;
    expect(withVariableDisplayContext(() => variables.value(54))).toBe('Wind');
    expect(rt.trackCacheKeyUsage.mock.calls).toHaveLength(tracked);
    delete variables.raw; rt.getRawGameVariableValue = () => 'ウインド';
    rt.enabled = false;
    expect(withVariableDisplayContext(() => variables.value(54))).toBe('ウインド');
});

it('finds troop-only cache entries and prefers them during troop execution', () => {
    const key = (text, type) => `${type}:${text}`;
    const keys = buildMessageCacheLookupKeys(key, '台詞', false, true);
    expect(keys[0]).toBe('troop:台詞');
    const cache = new Map([['message:台詞', ''], ['troop:台詞', 'Dialogue']]);
    expect(keys.find((entry) => cache.get(entry))).toBe('troop:台詞');
    expect(buildMessageCacheLookupKeys(key, '台詞', false)[0]).toBe('message:台詞');
});

it('persists canonical troop translations without creating message copies', () => {
    const rt = { getCacheKey: (text, type) => `${type}:${text}`, setCacheValue: vi.fn(),
        persistCache: vi.fn(), markBatchFailuresAsUntranslated: vi.fn() };
    new Troops().setData({ runtime: rt, pendingItems: [{ cacheKey: 'troop:台詞', value: '台詞', originalTypes: ['message'] }],
        successes: [{ cacheKey: 'troop:台詞', translated: 'Dialogue' }], failures: [] });
    expect(rt.setCacheValue.mock.calls.map(([key]) => key)).toEqual(['troop:台詞']);
    expect(rt.persistCache).toHaveBeenCalledWith(['troop:台詞']);
});
