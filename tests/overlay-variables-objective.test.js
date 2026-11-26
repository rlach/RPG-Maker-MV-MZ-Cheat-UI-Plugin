import { afterEach, expect, it, vi } from 'vitest';
import { getVariableType } from '../cheat-engine/www/cheat/js/VariableValueType.js';
import { getManualTextLayoutCapacities } from '../cheat-engine/www/cheat/js/translation-runtime/TextLayoutProviders.js';
import { LLMenuScreenCustomTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/LLMenuScreenCustomTranslator.js';
import { resolveOverlaySize } from '../cheat-engine/www/cheat/js/OverlayResize.js';

afterEach(() => vi.unstubAllGlobals());

it('defaults to the CSS viewport maximum only until a size has been saved', () => {
    expect(resolveOverlaySize(null, { innerWidth: 1000, innerHeight: 600 })).toEqual({ width: 980, height: 584 });
    expect(resolveOverlaySize(null, { innerWidth: 800, innerHeight: 1000 })).toEqual({ width: 784, height: 980 });
    expect(resolveOverlaySize({ width: 700, height: 400 }, { innerWidth: 1500, innerHeight: 1000 })).toEqual({ width: 700, height: 400 });
});

it('draws cached Objective content and keeps translated redraws and disabled rendering unchanged', () => {
    vi.stubGlobal('window', globalThis);
    const raw = '村を探索し、お願いを聞いて回る';
    const translated = 'Explore the village and hear requests';
    vi.stubGlobal('$plugins', [{ name: 'LL_MenuScreenCustomMV', status: true, parameters: { leftBlockValue: JSON.stringify(raw) } }]);
    class Base { drawText(text) { return text; } }
    class Window_MenuHelp extends Base { refresh() { this.rendered = this.drawText(raw); } }
    class Menu {
        update() {}
        createMenuHelpWindow() { this._menuHelpWindow = new Window_MenuHelp(); this._menuHelpWindow.refresh(); }
    }
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Scene_Menu', Menu);
    const tracked = [];
    const runtime = {
        enabled: true, translateCacheWhenDisabled: false,
        isTranslationEnabled() { return this.enabled; },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([[`plugin_ll_menu_screen:${raw}`, translated]]),
        hasUsableCacheValue(key) { return this.translationCache.has(key); },
        trackCacheKeyUsage(key) { tracked.push(key); },
    };
    const translator = new LLMenuScreenCustomTranslator();
    translator.getRuntime = () => runtime;
    expect(translator.enablePluginTranslation()).toBe(true);
    const scene = new Menu();
    scene.createMenuHelpWindow();
    expect(scene._menuHelpWindow.rendered).toBe(translated);
    expect(scene._menuHelpWindow.drawText(translated)).toBe(translated);
    expect(tracked).not.toContain(`plugin_ll_menu_screen:${translated}`);
    runtime.enabled = false;
    scene._menuHelpWindow.refresh();
    expect(scene._menuHelpWindow.rendered).toBe(raw);
});

it('distinguishes actual variable types without coercing numeric strings or arrays', () => {
    expect([1, '1', false, [], {}, null, undefined].map(getVariableType)).toEqual([
        'number', 'string', 'boolean', 'array', 'object', 'null', 'undefined',
    ]);
});

it('uses the manual count and configured size steps independently of detection', () => {
    expect(getManualTextLayoutCapacities(51, 0.7)).toEqual({ minus1: 72, base: 51, plus1: 35, plus2: 24 });
});

it('collects authored LL block expression text without executing the expression', () => {
    const translator = new LLMenuScreenCustomTranslator();
    const parameters = {
        leftBlockValue: '"村を探索し、お願いを聞いて回る"\n',
        rightBlockValue: 'globalThis.neverExecute("Do not execute")',
    };
    const before = JSON.stringify(parameters);
    const entries = [];
    translator._appendEntriesFromParameters(parameters, entries);
    expect(entries.map((entry) => entry.text)).toContain('村を探索し、お願いを聞いて回る');
    expect(JSON.stringify(parameters)).toBe(before);
    expect(globalThis.neverExecute).toBeUndefined();
});
