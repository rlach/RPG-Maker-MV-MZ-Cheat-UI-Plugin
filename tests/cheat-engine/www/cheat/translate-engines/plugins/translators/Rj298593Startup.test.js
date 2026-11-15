vi.mock('../../../../../../../cheat-engine/www/cheat/js/TranslateOnTheFlyState.js', () => ({
    TranslateOnTheFlyState: {},
}));
vi.mock('../../../../../../../cheat-engine/www/cheat/js/TranslateCacheRuntime.js', () => ({
    ensureTranslateCacheRuntime: vi.fn(),
}));
import { afterEach, expect, it, vi } from 'vitest';
import { TMSoloMenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TMSoloMenuTranslator.js';
import { MogMapNameHudTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MogMapNameHudTranslator.js';
import { translateOnTheFlyCoreMethods } from '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlyCoreMethods.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('loads modified solo-menu labels at startup without opening MT and redraws an already open menu', async () => {
    class Menu {
        createStatusWindow() {
            this._statusWindow = {
                drawSoloParameter() {},
                drawBattleParameter() {},
                drawActorLevelAndExp() {},
                drawText(text) {
                    this.drawn = text;
                },
                refresh() {
                    this.drawText('名声');
                },
            };
        }
    }
    const scene = new Menu();
    scene.createStatusWindow();
    vi.stubGlobal('window', {
        $plugins: [{ name: 'TMSoloMenu', status: true, parameters: {} }],
        Scene_Menu: Menu,
        SceneManager: { _scene: scene },
    });
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => "this.drawText('名声',0,0);",
    }));
    const t = new TMSoloMenuTranslator();
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map([['plugin_tm_solo_menu:名声', 'Fame']]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    await t.precomputeCounts();
    await Promise.resolve();
    expect(scene._statusWindow.drawn).toBe('Fame');
    const loaded = new Menu();
    loaded.createStatusWindow();
    expect(loaded._statusWindow.drawn).toBe('Fame');
});
it('translates animated map names without changing the stored name', () => {
    class Hud {
        constructor() {
            this.data = { name: '城下町' };
        }
        mapName() {
            return this.data.name;
        }
    }
    vi.stubGlobal('window', { Map_Name_Hud: Hud });
    const t = new MogMapNameHudTranslator();
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map([['map_name:城下町', 'Castle Town']]),
        hasUsableCacheValue: (key) => r.translationCache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    const hud = new Hud();
    expect(hud.mapName()).toBe('Castle Town');
    expect(hud.data.name).toBe('城下町');
});
it.each(['Demons Hunt', '\\I[247]Demons Hunt', '\\\\I[247]Demons Hunt', '\u001bi[247]Demons Hunt'])(
    'recognizes translated command decorations and redirects duplicate writes: %s',
    (display) => {
        const original = '\\i[247]悪魔討伐';
        const key = 'command:' + original;
        const r = {
            ...translateOnTheFlyCoreMethods,
            translationCache: new Map([[key, '\\i[247]Demons Hunt']]),
            hasUsableCacheValue(cacheKey) {
                return this.translationCache.has(cacheKey);
            },
            parseCompositeCacheKey(cacheKey) {
                return { type: 'command', textKey: cacheKey.slice(8) };
            },
            getCacheKey: (text, type) => type + ':' + text,
        };
        expect(r.getKnownCommandDisplayCacheKey(display)).toBe(key);
        expect(r.resolveCommandCacheWriteKey('command:' + display)).toBe(key);
        r.updateReverseCommandLookup(key, '\\I[247]New title');
        expect(r.getKnownCommandDisplayCacheKey(display)).toBeNull();
        expect(r.getKnownCommandDisplayCacheKey('New title')).toBe(key);
    }
);
