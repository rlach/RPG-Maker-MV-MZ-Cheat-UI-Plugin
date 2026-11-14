import { afterEach, expect, it, vi } from 'vitest';
import { MapNameExtendTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MapNameExtendTranslator.js';
import { YepCommonEventMenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/YepCommonEventMenuTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function runtimeFor(translator, pairs) {
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map(pairs),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return runtime;
}

it.each([false, true])('initializes MapNameExtend with MV/MZ measurement methods (MZ=%s)', (mz) => {
    class MapNameWindow {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
        textWidth(text) {
            return text.length;
        }
    }
    if (mz)
        MapNameWindow.prototype.textSizeEx = function (text) {
            return { width: text.length };
        };
    vi.stubGlobal('window', {
        Window_MapName: MapNameWindow,
        $gameMap: { displayName: () => '禍ツ島' },
    });
    const translator = new MapNameExtendTranslator();
    const runtime = runtimeFor(translator, [['map_name:禍ツ島', 'Cursed Island']]);
    expect(translator.enablePluginTranslation()).toBe(true);
    const display = new MapNameWindow();
    expect(display.drawText('禍ツ島')).toBe('Cursed Island');
    expect(display.drawTextEx('【禍ツ島】')).toBe('【Cursed Island】');
    expect(display.textWidth('禍ツ島')).toBe('Cursed Island'.length);
    if (mz) expect(display.textSizeEx('禍ツ島')).toEqual({ width: 'Cursed Island'.length });
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith('map_name:禍ツ島', expect.anything());
    expect(display.drawText('Other text')).toBe('Other text');
});

it('catalogs common-event help blocks for MT and translates presentation without changing database objects', async () => {
    class MenuWindow {
        drawTextEx(text) {
            return text;
        }
        setHelpWindowItem(item) {
            return item?.description;
        }
        setSubtextWindowItem(item) {
            return item?.menuSettings.subtext;
        }
    }
    const comments = [
        '<Menu Name: 操作説明>',
        ' <Help Description>',
        '【操作説明】',
        ' </Help Description>',
        '<Subtext>',
        '補足',
        '</Subtext>',
        '<Menu Enable Eval>',
        'enabled = true;',
        '</Menu Enable Eval>',
        '<Picture: help_1>',
    ];
    const events = [
        null,
        { id: 7, list: comments.map((text) => ({ code: 108, parameters: [text] })) },
    ];
    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'YEP_CommonEventMenu',
                status: true,
                parameters: { 'Default Help': '既定の説明' },
            },
        ],
        Window_CommonEventMenu: MenuWindow,
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, text: async () => JSON.stringify(events) }))
    );
    const translator = new YepCommonEventMenuTranslator();
    await translator.precomputeCounts();
    expect([...translator.entries.keys()]).toEqual([
        '操作説明',
        '【操作説明】\n',
        '補足\n',
        '既定の説明',
    ]);
    const runtime = runtimeFor(translator, [
        ['plugin_yep_common_event_menu:【操作説明】\n', 'Controls\n'],
        ['plugin_yep_common_event_menu:補足\n', 'Extra information\n'],
    ]);
    expect(translator.collectUntranslated({ runtime }).map((item) => item.value)).toEqual([
        '操作説明',
        '既定の説明',
    ]);
    expect(translator.enablePluginTranslation()).toBe(true);
    const item = Object.freeze({
        description: '【操作説明】\n',
        menuSettings: Object.freeze({ subtext: '補足\n', enabled: 'enabled = true;' }),
    });
    const display = new MenuWindow();
    expect(display.setHelpWindowItem(item)).toBe('Controls\n');
    expect(display.setSubtextWindowItem(item)).toBe('Extra information\n');
    expect(item.description).toBe('【操作説明】\n');
    expect(item.menuSettings.subtext).toBe('補足\n');
    expect(display.setHelpWindowItem(null)).toBeUndefined();
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_yep_common_event_menu:【操作説明】\n',
        expect.anything()
    );
});
