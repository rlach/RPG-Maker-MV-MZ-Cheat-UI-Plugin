import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MenuWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MenuWindowTranslator.js';
import { InfoWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/InfoWindowTranslator.js';
import { isVariableDisplayContext } from '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/VariableDisplayContext.js';

function createRuntime(translations = {}, enabled = true) {
    const cache = new Map(Object.entries(translations));
    const tracked = [];
    return {
        tracked,
        enabled,
        translationCache: cache,
        isTranslationEnabled() {
            return this.enabled;
        },
        translateCacheWhenDisabled: false,
        getCacheKey(value, type) {
            return `${type}:${value}`;
        },
        hasUsableCacheValue(key) {
            return cache.has(key);
        },
        getCacheValue(key) {
            return cache.get(key);
        },
        trackCacheKeyUsage(key) {
            tracked.push(key);
        },
    };
}

describe('MenuWindowTranslator', () => {
    const savedWindow = globalThis.window;
    const savedFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.window = {};
    });

    afterEach(() => {
        globalThis.window = savedWindow;
        globalThis.fetch = savedFetch;
        vi.restoreAllMocks();
    });

    it('collects menu_window.js and modified drawActorHp/Mp labels while ignoring kana keyboard tables', async () => {
        const menuWindowJs = `
Window_Gold.prototype.refresh = function() {
    this.drawText('週目', 35, 0);
    this.drawText('/', 85, 0);
};
`;
        const rpgWindowsJs = `
Window_Base.prototype.drawActorHp = function(actor, x, y, width) {
    this.drawText("淫乱度", x, y, 88);
};
Window_Base.prototype.drawActorMp = function(actor, x, y, width) {
    this.drawText("嫌悪度", x, y, 88);
};
Window_NameInput.JAPAN1 = ['あ','い','う','決定'];
`;

        globalThis.fetch = vi.fn(async (url) => {
            if (url === 'js/plugins/menu_window.js') {
                return { ok: true, text: async () => menuWindowJs };
            }
            if (url === 'js/rpg_windows.js') {
                return { ok: true, text: async () => rpgWindowsJs };
            }
            return { ok: false, status: 404, text: async () => '' };
        });

        globalThis.window.$plugins = [{ name: 'menu_window', status: true, parameters: {} }];

        const drawn = [];
        function Window_Base() {}
        Window_Base.prototype.drawText = function (text) {
            drawn.push(text);
        };
        globalThis.window.Window_Base = Window_Base;

        const runtime = createRuntime({
            'plugin_menu_window:週目': 'Week',
            'plugin_menu_window:淫乱度': 'Lewdness',
            'plugin_menu_window:嫌悪度': 'Disgust',
        });
        runtime.engine = {};

        const translator = new MenuWindowTranslator();
        translator.tagEngine = runtime.engine;
        vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
        await translator.precomputeCounts();

        expect([...translator.entries.keys()].sort()).toEqual(['嫌悪度', '淫乱度', '週目']);
        expect(translator.enablePluginTranslation()).toBe(true);

        const win = new Window_Base();
        win.drawText('週目');
        win.drawText('淫乱度');
        win.drawText('嫌悪度');
        win.drawText('決定'); // not in catalog

        expect(drawn).toEqual(['Week', 'Lewdness', 'Disgust', '決定']);

        // Repeated redraws & disabling translation
        runtime.enabled = false;
        drawn.length = 0;
        win.drawText('週目');
        win.drawText('淫乱度');
        expect(drawn).toEqual(['週目', '淫乱度']);
    });
});

describe('InfoWindowTranslator VariableDisplayContext integration', () => {
    const savedWindow = globalThis.window;
    const savedFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.window = {};
    });

    afterEach(() => {
        globalThis.window = savedWindow;
        globalThis.fetch = savedFetch;
        vi.restoreAllMocks();
    });

    it('wraps Window_Info.refresh in VariableDisplayContext so direct $gameVariables.value calls translate', async () => {
        globalThis.fetch = vi.fn(async () => ({
            ok: true,
            text: async () => "this.drawText('山内隆司', 0, 305, 200, 'center');",
        }));
        globalThis.window.$plugins = [{ name: 'InfoWindow', status: true, parameters: {} }];

        const drawn = [];
        const contextStates = [];

        const infoWindow = {
            drawText(text) {
                drawn.push(text);
            },
            refresh() {
                contextStates.push(isVariableDisplayContext());
                const v5 = isVariableDisplayContext() ? 'Yamauchi Pro Motto' : '山内プロ社訓';
                this.drawText(v5);
                this.drawText('山内隆司');
            },
        };

        function Scene_Menu() {}
        Scene_Menu.prototype.createInfoWindow = function () {
            this._InfoWindow = infoWindow;
        };
        globalThis.window.Scene_Menu = Scene_Menu;

        const runtime = createRuntime({
            'plugin_info_window:山内隆司': 'Takashi Yamauchi',
        });
        runtime.engine = {};

        const translator = new InfoWindowTranslator();
        translator.tagEngine = runtime.engine;
        vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
        await translator.precomputeCounts();
        expect(translator.enablePluginTranslation()).toBe(true);

        const scene = new Scene_Menu();
        scene.createInfoWindow();
        expect(isVariableDisplayContext()).toBe(false);
        scene._InfoWindow.refresh();
        expect(isVariableDisplayContext()).toBe(false);

        expect(contextStates).toEqual([true]);
        expect(drawn).toEqual(['Yamauchi Pro Motto', 'Takashi Yamauchi']);
    });
});
