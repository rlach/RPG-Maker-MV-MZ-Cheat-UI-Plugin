import { afterEach, expect, it, vi } from 'vitest';
import { TaSceneStatusExtendTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TaSceneStatusExtendTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('collects configured page labels and headers without unused status pages', () => {
    const parameters = {
        PageSelectWindowList: JSON.stringify([
            JSON.stringify({ PageContents: 'Exp', PageName: '経験値' }),
            JSON.stringify({ PageContents: 'Equips', PageName: '装備' }),
        ]),
        ExpHeader: '経験値',
        EquipmentsHeader: '現在の装備',
        SpParametersHeader: '未使用',
    };
    vi.stubGlobal('window', { $plugins: [{ name: 'TA_SceneStatusExtendMZ', parameters }] });
    const t = new TaSceneStatusExtendTranslator();
    t.collectAdditionalTexts();
    expect([...t.entries.keys()]).toEqual(['経験値', '装備', '現在の装備']);
});
it('translates headers and private tab windows immediately, preserving source configuration and other windows', () => {
    class Base {
        drawText(text) {
            return text;
        }
    }
    class Window_StatusDetail extends Base {}
    class Window_STList extends Base {}
    const parameters = {
        PageSelectWindowList: JSON.stringify([
            JSON.stringify({ PageContents: 'Equips', PageName: '装備' }),
        ]),
        EquipmentsHeader: '現在の装備',
    };
    vi.stubGlobal('window', {
        Window_Base: Base,
        $plugins: [{ name: 'TA_SceneStatusExtendMZ', parameters }],
    });
    const t = new TaSceneStatusExtendTranslator();
    let enabled = true;
    const r = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: () => true,
        translationCache: new Map([
            ['装備', 'Equipment'],
            ['現在の装備', 'Current Equipment'],
        ]),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Window_STList().drawText('装備')).toBe('Equipment');
    expect(new Window_StatusDetail().drawText('現在の装備')).toBe('Current Equipment');
    expect(new Base().drawText('装備')).toBe('装備');
    new Window_STList().drawText('Equipment');
    expect(r.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual(['装備', '現在の装備']);
    expect(parameters.EquipmentsHeader).toBe('現在の装備');
    enabled = false;
    expect(new Window_STList().drawText('装備')).toBe('装備');
});
