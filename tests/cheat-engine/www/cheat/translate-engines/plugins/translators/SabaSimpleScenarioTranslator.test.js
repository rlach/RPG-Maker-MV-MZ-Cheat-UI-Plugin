import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SabaSimpleScenarioTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SabaSimpleScenarioTranslator.js';

const lines = ['（けれど【魔法巫女】は純粋に人を助けられるし、', '　その評判は全て直に聞ける）'];
const list = [
    { code: 101, parameters: ['', 0, 0, 2, 'セリカ'] },
    ...lines.map((text) => ({ code: 401, parameters: [text] })),
    { code: 102, parameters: [['　選択肢', '戻る'], 0] },
    { code: 105, parameters: [2, false] },
    { code: 405, parameters: ['スクロール'] },
];
let runtime;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [{ name: 'Nore_Tes', status: true }]);
    vi.stubGlobal('$dataScenario', { chapter: list, duplicate: list });
    vi.stubGlobal(
        'Game_Interpreter',
        class {
            command101() {
                return 123;
            }
        }
    );
    runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map(),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
});
afterEach(() => vi.unstubAllGlobals());

it.each(['Nore_Tes', 'Saba_SimpleScenario', 'nested/Nore_Tes'])(
    'detects enabled %s and preserves standard message keys in scans and runtime observation',
    async (name) => {
        $plugins[0].name = name;
        const translator = new SabaSimpleScenarioTranslator();
        expect(translator.detectPlugin()).toBe(true);
        await Promise.all([translator.precomputeCounts(), translator.precomputeCounts()]);
        const items = translator.collectUntranslated({ runtime });
        const message = items.find((item) => item.type === 'message');
        expect(message.value).toBe(lines.join('\n'));
        expect(items.map((item) => item.type).sort()).toEqual([
            'choice',
            'choice',
            'message',
            'scroll_text',
            'speaker',
        ]);
        expect(translator.getCachedCountsSync({ runtime }).left).toBe(5);
        runtime.translationCache.set(message.cacheKey, 'Already translated');
        expect(translator.getCachedCountsSync({ runtime }).left).toBe(4);
        expect(translator.collectUntranslated({ runtime })).not.toContainEqual(message);
        expect(translator.enablePluginTranslation()).toBe(true);
        const interpreter = new Game_Interpreter();
        interpreter._list = list;
        interpreter._index = 0;
        expect(interpreter.command101()).toBe(123);
        expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(message.cacheKey);
        runtime.trackCacheKeyUsage.mockClear();
        runtime.isTranslationEnabled = () => false;
        interpreter.command101();
        expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
        expect($dataScenario.chapter[1].parameters[0]).toBe(lines[0]);
        $plugins[0].status = false;
        expect(new SabaSimpleScenarioTranslator().detectPlugin()).toBe(false);
    }
);

it('loads Nore compiled scenarios through its own loader, never data/Scenario.json', async () => {
    vi.stubGlobal('$dataScenario', undefined);
    const loadScenarioFile = vi.fn((name) => {
        window[name] = { chapter: list };
    });
    const loadDataFile = vi.fn();
    vi.stubGlobal('DataManager', { loadScenarioFile, loadDataFile });
    const translator = new SabaSimpleScenarioTranslator();
    await translator.precomputeCounts();
    expect(loadScenarioFile).toHaveBeenCalledWith(expect.any(String), 'Scenario.json');
    expect(loadDataFile).not.toHaveBeenCalled();
    expect(translator.getCachedCountsSync({ runtime }).total).toBe(5);
});

it.each([
    ['Nore_Tes', 'scenario'],
    ['Saba_SimpleScenario', 'data'],
])('uses the correct %s fallback URL without altering database globals', async (name, folder) => {
    $plugins[0].name = name;
    vi.stubGlobal('$dataScenario', undefined);
    vi.stubGlobal('DataManager', undefined);
    const open = vi.fn();
    vi.stubGlobal(
        'XMLHttpRequest',
        class {
            status = 200;
            responseText = JSON.stringify({ chapter: list });
            open = open;
            send() {
                this.onload();
            }
        }
    );
    const translator = new SabaSimpleScenarioTranslator();
    await translator.precomputeCounts();
    expect(open).toHaveBeenCalledWith('GET', `${folder}/Scenario.json`, true);
    expect(translator.getCachedCountsSync({ runtime }).total).toBe(5);
    expect($dataScenario).toBeUndefined();
});
