import { afterEach, expect, it, vi } from 'vitest';
import { NuunRandomItemsTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/NuunRandomItemsTranslator.js';
const state = vi.hoisted(() => ({ command: null }));
vi.mock('../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js', () => ({ loadMapDataById: async () => ({events:[null,{pages:[{list:[state.command]}]}]}) }));
afterEach(() => vi.unstubAllGlobals());
it('harvests nested ItemList GetText overrides from map and common events and feeds runtime messages', async () => {
    const source = '\\I[350]特ダネ';
    const command = {
        code: 357,
        parameters: [
            'NUUN_RandomItems',
            'ItemList',
            'ItemList',
            {
                list: JSON.stringify([
                    JSON.stringify({
                        ItemId: '294',
                        GetText: source,
                        Cond: '$gameSwitches.value(2)',
                        weight: '1',
                    }),
                ]),
            },
        ],
    };
    state.command = command;
    vi.stubGlobal('window', {
        $plugins: [
            { name: 'NUUN_RandomItems', status: true, parameters: { GetTextMessage: '%1' } },
        ],
        $dataCommonEvents: [null, { list: [command] }],
        $dataMapInfos: [null, { id: 206, name: '探索マップ' }],
    });
    vi.stubGlobal('$plugins', window.$plugins);
    vi.stubGlobal('fetch', async (path) => ({
        ok: true,
        text: async () =>
            path.startsWith('js/plugins/')
                ? 'const parameter = {};'
                : JSON.stringify({ events: [null, { pages: [{ list: [command] }] }] }),
    }));
    const t = new NuunRandomItemsTranslator();
    t.registerPluginCustomTags = () => {};
    await t.precomputeCounts();
    expect(t.shouldScanEventData()).toBe(true);
    const cache = new Map();
    const runtime = {
        engine: {},
        isTranslationEnabled: () => true,
        getCacheKey: (s, type) => `${type}:${s}`,
        getMessageCacheKey: (s) => `message:${s}`,
        translationCache: cache,
        hasUsableCacheValue: (key) => cache.has(key),
        trackCacheKeyUsage: vi.fn(),
        setCacheValue: (key, value) => cache.set(key, value),
    };
    const pending = t.collectUntranslated({ runtime }).filter((item) => item.value === source);
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('plugin_nuun_randomitems');
    expect([...t.entries.keys()]).not.toContain('探索マップ');
    expect([...t.entries.keys()]).not.toContain('$gameSwitches.value(2)');
    cache.set(pending[0].cacheKey, '\\I[350]Scoop');
    t.cacheMessageTranslation(source, { faceName: () => '' }, runtime);
    expect(cache.get(`message:${source}`)).toBe('\\I[350]Scoop');
    expect(t.resolveText(source, runtime)).toBe('\\I[350]Scoop');
    expect(command.parameters[3].list).toContain('特ダネ');
});
