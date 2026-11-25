import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { win32 } from 'node:path';
import { AdvSystemTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/AdvSystemTranslator.js';

let root;
beforeEach(() => {
    root = {
        $plugins: [{ name: 'ADVsystem', status: true }],
        location: { protocol: 'chrome-extension:' },
        nw: { App: { startPath: 'D:\\Games\\Elise 日本語' } },
        ADV_System: class {
            localFileDirectoryPath() {
                return this.directory || '/scenario/';
            }
            loadScenario(name) {
                return this.localFileDirectoryPath() + 'En/' + name + '.sl';
            }
        },
    };
    vi.stubGlobal('window', root);
    vi.stubGlobal('require', () => win32);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it('fixes the shared getter used by scenario, localized scenario and replay reads', () => {
    const translator = new AdvSystemTranslator();
    expect(translator.enablePluginTranslation()).toBe(true);
    const scenario = new root.ADV_System();
    expect(scenario.localFileDirectoryPath()).toBe('D:\\Games\\Elise 日本語\\scenario\\');
    expect(scenario.loadScenario('002')).toBe('D:\\Games\\Elise 日本語\\scenario\\En/002.sl');
});

it('keeps filesystem access working with all translation settings disabled', () => {
    root.__TranslationRuntime = { enabled: false, translateCacheWhenDisabled: false };
    new AdvSystemTranslator().enablePluginTranslation();
    expect(new root.ADV_System().localFileDirectoryPath()).toBe(
        'D:\\Games\\Elise 日本語\\scenario\\'
    );
});

it('preserves valid filesystem paths and this binding', () => {
    new AdvSystemTranslator().enablePluginTranslation();
    const scenario = new root.ADV_System();
    for (const directory of ['E:/Custom/scenario/', '\\\\server\\share\\scenario\\', 'scenario/']) {
        scenario.directory = directory;
        expect(scenario.localFileDirectoryPath()).toBe(directory);
    }
});

it('preserves file protocol behavior even if the getter returns a rooted directory', () => {
    root.location.protocol = 'file:';
    delete root.nw;
    new AdvSystemTranslator().enablePluginTranslation();
    expect(new root.ADV_System().localFileDirectoryPath()).toBe('/scenario/');
});

it('retries until the plugin constructor and NW.js application root are ready', () => {
    const translator = new AdvSystemTranslator();
    const Constructor = root.ADV_System;
    delete root.ADV_System;
    expect(translator.enablePluginTranslation()).toBe(false);
    root.ADV_System = Constructor;
    root.nw.App.startPath = '';
    expect(translator.enablePluginTranslation()).toBe(false);
    root.nw.App.startPath = 'D:\\Games\\Renamed';
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(new root.ADV_System().localFileDirectoryPath()).toBe('D:\\Games\\Renamed\\scenario\\');
});

it.each([[], [{ name: 'ADVsystem', status: false }], [{ name: 'Other', status: true }]])(
    'does not activate for absent or disabled ADVsystem: %j',
    (plugins) => {
        vi.useFakeTimers();
        root.$plugins = plugins;
        const original = root.ADV_System.prototype.localFileDirectoryPath;
        expect(new AdvSystemTranslator().ensureDetection()).toBe(false);
        vi.runAllTimers();
        expect(root.ADV_System.prototype.localFileDirectoryPath).toBe(original);
    }
);

it('uses the root game window and the base lifecycle guard across separate windows', () => {
    vi.useFakeTimers();
    const first = new AdvSystemTranslator();
    expect(first.ensureDetection()).toBe(true);
    vi.runAllTimers();
    const patched = root.ADV_System.prototype.localFileDirectoryPath;
    vi.stubGlobal('window', {
        __CHEAT_EXTERNAL_WINDOW__: true,
        opener: root,
        $plugins: root.$plugins,
    });
    expect(new AdvSystemTranslator().ensureDetection()).toBe(true);
    vi.runAllTimers();
    expect(root.ADV_System.prototype.localFileDirectoryPath).toBe(patched);
    expect(new root.ADV_System().localFileDirectoryPath()).toBe('D:\\Games\\Elise 日本語\\scenario\\');
});
