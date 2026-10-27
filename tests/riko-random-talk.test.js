import { it, expect, vi, afterEach } from 'vitest';
import { BasePluginTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/BasePluginTranslator.js';
afterEach(() => vi.unstubAllGlobals());
it('tracks original random talk once through setup and does not harvest colored English outputs', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('__CheatBasePluginTranslator', BasePluginTranslator);
    const { RJ352933TsukaTranslator } = await import('../example/RJ352933-Tsuka.js');
    const source = '放して…';
    const output = 'Let go…';
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([['plugin_rj352933_tsuka_random_talk:' + source, output]]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
    vi.stubGlobal('$gameVariables', {
        _data: [],
        value: () => output,
        setValue(id, text) {
            this._data[id] = text;
        },
    });
    vi.stubGlobal('CCUtils', {
        setupRandomTalk() {
            $gameVariables._data[884] = source;
        },
    });
    vi.stubGlobal(
        'Game_System',
        class {
            pushGabRightMessage(text) {
                return text;
            }
            pushGabLeftMessage(text) {
                return text;
            }
        }
    );
    expect(new RJ352933TsukaTranslator().enablePluginTranslation()).toBe(true);
    CCUtils.setupRandomTalk('group');
    expect($gameVariables._data[884]).toBe(output);
    const system = new Game_System();
    expect(system.pushGabRightMessage(output)).toBe(output);
    expect(system.pushGabRightMessage('\\c[11]' + output)).toBe('\\c[11]' + output);
    expect(runtime.trackCacheKeyUsage.mock.calls.every(([key]) => key.endsWith(source))).toBe(true);
});
