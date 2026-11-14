import { afterEach, expect, it, vi } from 'vitest';
import { LlVariableWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LlVariableWindowTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('catalogs result labels and hooks all private windows once without changing numeric results', async () => {
    class VariableWindow {
        drawText(text, ...args) {
            return [text, ...args];
        }
        textWidth(text) {
            return String(text).length;
        }
    }
    class Scene {
        createExVariableWindow() {
            for (let id = 1; id <= 4; id++) this[`_exVariableWindow${id}`] = new VariableWindow();
        }
    }
    vi.stubGlobal('window', {
        Scene_Map: Scene,
        $plugins: [{ name: 'LL_VariableWindow', status: true, parameters: {} }],
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, text: async () => 'const labels = ["経験値", "回数"];' }))
    );
    const translator = new LlVariableWindowTranslator();
    await translator.precomputeCounts();
    expect([...translator.entries.keys()]).toEqual(['経験値', '回数']);
    let enabled = true;
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([['plugin_ll_variable_window:経験値', 'Experience']]),
        hasUsableCacheValue: (key) => runtime.translationCache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const scene = new Scene();
    scene.createExVariableWindow();
    translator.hookVariableWindows(scene);
    for (let id = 1; id <= 4; id++) {
        const display = scene[`_exVariableWindow${id}`];
        expect(display.drawText('経験値', 10, 20, 300)).toEqual(['Experience', 10, 20, 300]);
        expect(display.drawText(50)).toEqual([50]);
        expect(display.drawText('+0')).toEqual(['+0']);
    }
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(4);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_ll_variable_window:経験値',
        expect.anything()
    );
    enabled = false;
    expect(scene._exVariableWindow1.drawText('経験値')).toEqual(['経験値']);
});

it('waits for the variable-window factory', () => {
    vi.stubGlobal('window', {});
    expect(new LlVariableWindowTranslator().enablePluginTranslation()).toBe(false);
});
