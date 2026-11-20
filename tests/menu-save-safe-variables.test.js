import { afterEach, expect, it, vi } from 'vitest';
import { NuunSaveScreenTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/NuunSaveScreenTranslator.js';
import { LLMenuScreenCustomTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/LLMenuScreenCustomTranslator.js';
import { isVariableDisplayContext } from '../cheat-engine/www/cheat/js/translation-runtime/VariableDisplayContext.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function runtime() {
    return {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        isVariableSafeForTranslation: (id) => [10, 26].includes(id),
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([
            ['variable_value:寝室のミサの様子を見よう', 'Check on Misa in the bedroom'],
            ['variable_value:【ルミナス教会_第三支部】', '【Luminous Church Third Branch】'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
}
it('translates saved NUUN variable values using their saved text and preserves the save and safety rules', () => {
    const t = new NuunSaveScreenTranslator();
    const rt = runtime();
    t.getRuntime = () => rt;
    const proto = {
        drawOriginal(info, x, y, width, data, index) {
            return info[`orgParam_${index}`];
        },
    };
    t._hookSavedVariableValue(proto);
    const info = {
        orgParam_4: '【ルミナス教会_第三支部】',
        orgParam_6: '寝室のミサの様子を見よう',
    };
    const draw = (id, index) =>
        proto.drawOriginal(
            info,
            0,
            0,
            500,
            { DetaEval: `$gameVariables.value(${id});//ゲーム変数` },
            index
        );
    expect(draw(10, 4)).toBe('【Luminous Church Third Branch】');
    expect(draw(26, 6)).toBe('Check on Misa in the bedroom');
    expect(draw(27, 6)).toBe(info.orgParam_6);
    expect(
        proto.drawOriginal(info, 0, 0, 500, { DetaEval: '$gameVariables.value(26) + 1' }, 6)
    ).toBe(info.orgParam_6);
    rt.enabled = false;
    expect(draw(26, 6)).toBe(info.orgParam_6);
    expect(info.orgParam_6).toBe('寝室のミサの様子を見よう');
    expect(isVariableDisplayContext()).toBe(false);
});
it('opens and refreshes LL menu values within display context without exposing translated gameplay reads', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'LL_MenuScreenCustom', status: true, parameters: { menuHelpTexts: '[]' } },
    ]);
    const rt = runtime();
    const raw = '寝室のミサの様子を見よう';
    const read = () =>
        isVariableDisplayContext() && rt.enabled ? 'Check on Misa in the bedroom' : raw;
    class Base {
        drawText(text) {
            return text;
        }
    }
    class Help extends Base {
        refresh() {
            this.rendered = this.drawText(read());
        }
    }
    class Menu {
        update() {}
        createMenuHelpWindow() {
            this._menuHelpWindow = new Help();
            this._menuHelpWindow.refresh();
        }
    }
    vi.stubGlobal('Window_Base', Base);
    vi.stubGlobal('Scene_Menu', Menu);
    const t = new LLMenuScreenCustomTranslator();
    t.getRuntime = () => rt;
    expect(t.enablePluginTranslation()).toBe(true);
    const scene = new Menu();
    scene.createMenuHelpWindow();
    expect(scene._menuHelpWindow.rendered).toBe('Check on Misa in the bedroom');
    expect(read()).toBe(raw);
    scene._menuHelpWindow.refresh();
    expect(scene._menuHelpWindow.rendered).toBe('Check on Misa in the bedroom');
    rt.enabled = false;
    scene._menuHelpWindow.refresh();
    expect(scene._menuHelpWindow.rendered).toBe(raw);
    expect(isVariableDisplayContext()).toBe(false);
    expect(() =>
        scene._menuHelpWindow.refresh.call({
            drawText() {
                throw Error('draw failed');
            },
        })
    ).toThrow('draw failed');
    expect(isVariableDisplayContext()).toBe(false);
});
