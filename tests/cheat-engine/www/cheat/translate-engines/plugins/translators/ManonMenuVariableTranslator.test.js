import { afterEach, expect, it, vi } from 'vitest';
import { ManonMenuVariableTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ManonMenuVariableTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('catalogs the menu caption/unit and translates them before unit measurement without changing variable values', async () => {
    class BaseWindow {
        drawVariableValue(label, value, unit, x, y, width) {
            return { label, value, unit, unitWidth: unit.length, x, y, width };
        }
    }
    const parameters = { showVariableNumber: '1', firstText: '評判', unitText: '点' };
    vi.stubGlobal('window', {
        $plugins: [{ name: 'Manon_MenuVariable', status: true, parameters }],
        Window_Base: BaseWindow,
    });
    const translator = new ManonMenuVariableTranslator();
    await translator.precomputeCounts();
    let enabled = true;
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map([
            ['plugin_manon_menu_variable:評判', 'Reputation'],
            ['plugin_manon_menu_variable:点', 'points'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect([...translator.entries.keys()]).toEqual(['評判', '点']);
    expect(translator.enablePluginTranslation()).toBe(true);
    const display = new BaseWindow();
    expect(display.drawVariableValue('評判', 123, '点', 0, 0, 200)).toEqual({
        label: 'Reputation',
        value: 123,
        unit: 'points',
        unitWidth: 6,
        x: 0,
        y: 0,
        width: 200,
    });
    expect(parameters.firstText).toBe('評判');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_manon_menu_variable:評判',
        expect.anything()
    );
    enabled = false;
    expect(display.drawVariableValue('評判', 123, '点', 0, 0, 200).label).toBe('評判');
});
