import { it, expect, vi, afterEach } from 'vitest';
import { NuunMenuScreenExTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NuunMenuScreenExTranslator.js';
import { NuunSaveScreenTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NuunSaveScreenTranslator.js';
import { NuunDestinationTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NuunDestinationTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function runtimeFor(translator) {
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return runtime;
}
it('detects and scans the flat legacy menu layout without evaluating scripts', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        {
            name: 'NUUN_MenuScreen_2',
            status: true,
            parameters: {
                PageList1: JSON.stringify([
                    JSON.stringify({ ParamName: '💖淫乱度', DataEval: 'mustNotExecute()' }),
                ]),
                PageList2: JSON.stringify([JSON.stringify({ ParamName: '次の目的' })]),
            },
        },
    ]);
    const translator = new NuunMenuScreenExTranslator();
    expect(translator.detectPlugin()).toBe(true);
    const entries = await translator.buildScanEntries();
    expect(entries.map((entry) => entry.text)).toEqual(
        expect.arrayContaining(['💖淫乱度', '次の目的'])
    );
    expect(entries.some((entry) => entry.text.includes('mustNotExecute'))).toBe(false);
});
it('uses map_name for existing save location values without changing save data', () => {
    vi.stubGlobal('window', globalThis);
    const translator = new NuunSaveScreenTranslator();
    const runtime = runtimeFor(translator);
    runtime.translationCache.set('map_name:城塞都市ザイアード', 'Fortress City');
    const prototype = {
        drawMapName(info) {
            return info.mapname;
        },
    };
    translator._hookMapNameValue(prototype);
    const info = { mapname: '城塞都市ザイアード', gold: 1000 };
    expect(prototype.drawMapName(info)).toBe('Fortress City');
    expect(info.mapname).toBe('城塞都市ザイアード');
    runtime.enabled = false;
    expect(prototype.drawMapName(info)).toBe(info.mapname);
});
it('scans destination text and translates both display getters without changing destination IDs', async () => {
    vi.stubGlobal('window', globalThis);
    const source = '「宿屋」にあいさつに行く';
    vi.stubGlobal('$plugins', [
        {
            name: 'NUUN_Destination',
            status: true,
            parameters: {
                DestinationList: JSON.stringify([JSON.stringify({ DestinationText: source })]),
            },
        },
    ]);
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '' }));
    class WindowBase {
        getDestinationList() {
            return source;
        }
    }
    class System {
        getDestinationList() {
            return source;
        }
    }
    vi.stubGlobal('Window_Base', WindowBase);
    vi.stubGlobal('Game_System', System);
    const translator = new NuunDestinationTranslator();
    const runtime = runtimeFor(translator);
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();
    expect(translator.collectUntranslated({ runtime }).map((item) => item.value)).toEqual([source]);
    runtime.translationCache.set('plugin_nuun_destination:' + source, 'Visit the inn');
    expect(new WindowBase().getDestinationList()).toBe('Visit the inn');
    expect(new System().getDestinationList()).toBe('Visit the inn');
    runtime.enabled = false;
    expect(new WindowBase().getDestinationList()).toBe(source);
});
