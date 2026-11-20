import { afterEach, expect, it, vi } from 'vitest';
import { VisuCoreInterfaceTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/VisuCoreInterfaceTranslator.js';
afterEach(() => vi.unstubAllGlobals());
async function setup() {
    class Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
        textWidth(text) {
            return String(text).length;
        }
    }
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    vi.stubGlobal('window', { Window_Base: Base, Bitmap });
    const plugins = [
        {
            name: 'VisuMZ_1_ItemsEquipsCore',
            status: true,
            parameters: {
                'StatusWindow:struct': JSON.stringify({
                    'LabelRecoverHP:str': '%1 リカバリー',
                    'LabelConsume:str': '消耗品',
                    'LabelHitType:str': 'タイプ',
                    'Speed:str': '普通',
                    'DrawJS:func': 'this.drawText("正確さ");',
                }),
            },
        },
        {
            name: 'VisuMZ_1_SaveCore',
            status: true,
            parameters: {
                'SaveConfirm:struct': JSON.stringify({ 'VocabSaveSuccess:str': 'セーブ完了' }),
            },
        },
        {
            name: 'VisuMZ_3_VictoryAftermath',
            status: true,
            parameters: {
                'LevelUp:struct': JSON.stringify({
                    'NewSkillQuotes:arrayjson': '["\\"スキル習得！\\""]',
                }),
            },
        },
        {
            name: 'VisuMZ_4_FullFieldRecovery',
            status: true,
            parameters: {
                'General:struct': JSON.stringify({
                    'MsgWindow_AlreadyFull:json': '"既に全快しています"',
                }),
            },
        },
    ];
    vi.stubGlobal('fetch', async (path) => ({
        ok: true,
        text: async () =>
            path === 'data/Enemies.json'
                ? JSON.stringify([null, { name: '反転オオカミ' }])
                : `var $plugins=${JSON.stringify(plugins)};`,
    }));
    const t = new VisuCoreInterfaceTranslator();
    t.registerPluginCustomTags = () => {};
    const cache = new Map();
    let enabled = true;
    const rt = {
        engine: {},
        isTranslationEnabled: () => enabled,
        getCacheKey: (s, type) => `${type}:${s}`,
        translationCache: cache,
        hasUsableCacheValue: (key) => cache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    t.getRuntime = () => rt;
    expect(t.enablePluginTranslation()).toBe(true);
    await t.scanPromise;
    return {
        t,
        rt,
        cache,
        Base,
        Bitmap,
        disable: () => {
            enabled = false;
        },
    };
}
it('collects nested vocabulary, JSON-string messages and scripted labels', async () => {
    const { t } = await setup();
    expect([...t.entries.keys()]).toEqual(
        expect.arrayContaining([
            '消耗品',
            '普通',
            '正確さ',
            'セーブ完了',
            'スキル習得！',
            '既に全快しています',
            '\\COT[0] リカバリー',
        ])
    );
    expect(t.entries.has('"既に全快しています"')).toBe(false);
});
it('renders recovery templates with unchanged values and reuses typed enemy and map caches', async () => {
    const { t, rt, cache, Base, Bitmap, disable } = await setup();
    cache.set('plugin_visu_core_interface:\\COT[0] リカバリー', '\\COT[0] Recovery');
    cache.set('plugin_visu_core_interface:セーブ完了', 'Save complete');
    cache.set('enemy_name:反転オオカミ', 'Inverted Wolf');
    cache.set('map_name:校庭', 'Schoolyard');
    expect(new Base().drawText('HP リカバリー')).toBe('HP Recovery');
    expect(new Base().drawText('セーブ完了')).toBe('Save complete');
    expect(new Bitmap().drawText('反転オオカミ')).toBe('Inverted Wolf');
    expect(new Bitmap().drawText('校庭')).toBe('Schoolyard');
    expect(new Base().drawText('100%')).toBe('100%');
    disable();
    expect(t.resolveText('校庭', rt)).toBe('校庭');
});

it('collects the Type label, preserves enemy letters and item icons, and avoids partial crafting translations', async () => {
    const { t, rt, cache, Base, Bitmap } = await setup();
    expect(t.entries.has('タイプ')).toBe(true);
    cache.set('enemy_name:反転オオカミ', 'Inverted Wolf');
    cache.set('item_name:ペンチ', 'Pliers');
    cache.set('plugin_alchemy_system:必要素材：', 'Required Materials:');
    expect(new Bitmap().drawText('反転オオカミ A')).toBe('Inverted Wolf A');
    expect(new Bitmap().drawText('反転オオカミ B')).toBe('Inverted Wolf B');
    expect(new Base().drawText('\\I[42]ペンチ')).toBe('\\I[42]Pliers');
    expect(new Base().drawText('必要素材：')).toBe('Required Materials:');
    cache.set('enemy_name:反転オオカミ', '反転オオカミ');
    expect(t.collectUntranslated({ runtime: rt })).toContainEqual(
        expect.objectContaining({
            type: 'enemy_name',
            cacheKey: 'enemy_name:反転オオカミ',
            value: '反転オオカミ',
        })
    );
    cache.set('enemy_name:反転オオカミ', 'Inverted Wolf');
    expect(t.collectUntranslated({ runtime: rt }).some((item) => item.type === 'enemy_name')).toBe(
        false
    );
});
