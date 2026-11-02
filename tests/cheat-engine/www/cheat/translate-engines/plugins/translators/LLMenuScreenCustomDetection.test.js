import { it, expect, vi, afterEach } from 'vitest';
import { LLMenuScreenCustomTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LLMenuScreenCustomTranslator.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/PluginTranslatorRegistry.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const compactParameters = {
    commandImages: '[]',
    actorPictures: '[]',
    hideUnconfiguredCommands: 'true',
};

it('rejects the RJ01705945 picture-only replacement without installing hooks or starting retries', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'LL_MenuScreenCustom', status: true, parameters: compactParameters },
    ]);
    const translator = new LLMenuScreenCustomTranslator();
    const schedule = vi.spyOn(translator, '_scheduleEnablePluginTranslation');
    expect(translator.ensureDetection()).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
    const registry = {
        translatorInstances: new Map([[translator.getPluginName(), translator]]),
        detectedPluginNames: new Set(),
    };
    PLUGIN_TRANSLATOR_REGISTRY._markDetectedPluginsFromManifest.call(
        registry,
        new Set(['ll_menuscreencustom'])
    );
    expect(registry.detectedPluginNames.size).toBe(0);
    expect(schedule).not.toHaveBeenCalled();
});

it.each(['LL_MenuScreenCustom', 'LL_MenuScreenCustomMV'])(
    'retains detection and scanning for the standard %s plugin',
    (name) => {
        vi.stubGlobal('window', globalThis);
        vi.stubGlobal('$plugins', [
            {
                name,
                status: true,
                parameters: {
                    menuHelpTexts: JSON.stringify([
                        JSON.stringify({ symbol: 'Item', helpText: 'Use an item' }),
                    ]),
                    leftBlockLabel: 'Location',
                },
            },
        ]);
        const translator = new LLMenuScreenCustomTranslator();
        expect(translator.detectPlugin()).toBe(true);
        expect(translator.buildScanEntries().map((entry) => entry.text)).toEqual(
            expect.arrayContaining(['Use an item', 'Location'])
        );
        vi.stubGlobal(
            'Scene_Menu',
            class {
                update() {}
            }
        );
        expect(translator.enablePluginTranslation()).toBe(false);
    }
);

it('does not exclude a compatible text-enabled extension with image settings', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        {
            name: 'LL_MenuScreenCustom',
            status: true,
            parameters: { ...compactParameters, menuHelpTexts: '[]' },
        },
    ]);
    expect(new LLMenuScreenCustomTranslator().detectPlugin()).toBe(true);
});

it('translates current location from map_name in private menu windows, preserving time and source names', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'LL_MenuScreenCustom', status: true, parameters: { menuHelpTexts: '[]' } },
    ]);
    let location = 'ペタルプロ事務所';
    vi.stubGlobal('$gameMap', { displayName: () => location });
    class BaseWindow {
        drawText(text) {
            return text;
        }
    }
    class Window_MenuHelp extends BaseWindow {}
    class Menu {
        update() {}
        createMenuHelpWindow() {
            this._menuHelpWindow = new Window_MenuHelp();
        }
    }
    vi.stubGlobal('Window_Base', BaseWindow);
    vi.stubGlobal('Scene_Menu', Menu);
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        translationCache: new Map([['map_name:ペタルプロ事務所', 'Petal Pro Office']]),
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    const translator = new LLMenuScreenCustomTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const scene = new Menu();
    scene.createMenuHelpWindow();
    expect(scene._menuHelpWindow.drawText(location)).toBe('Petal Pro Office');
    expect(new Window_MenuHelp().drawText(location)).toBe('Petal Pro Office');
    expect(scene._menuHelpWindow.drawText('00:12:34')).toBe('00:12:34');
    expect($gameMap.displayName()).toBe('ペタルプロ事務所');
    location = '未翻訳の場所';
    expect(scene._menuHelpWindow.drawText(location)).toBe(location);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'map_name:未翻訳の場所',
        expect.anything()
    );
    runtime.enabled = false;
    expect(scene._menuHelpWindow.drawText('ペタルプロ事務所')).toBe('ペタルプロ事務所');
});
