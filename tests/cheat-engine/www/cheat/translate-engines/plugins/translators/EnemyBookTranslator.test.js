import { afterEach, expect, it, vi } from 'vitest';
import { EnemyBookTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/EnemyBookTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('collects desc1/desc2 before observation and translates handbook lines without changing metadata', async () => {
    const first = '身体が水のような下級の魔物。';
    const second = '水場の近くによく出現する。';
    const enemy = {
        note: `<desc1:${first}><desc2:${second}><book:yes>`,
        meta: { desc1: first, desc2: second },
    };
    class BaseWindow {
        drawTextEx(text) {
            return text;
        }
    }
    class Window_EnemyBookStatus extends BaseWindow {}
    vi.stubGlobal('window', { Window_Base: BaseWindow });
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () => JSON.stringify([null, enemy]),
    }));
    const t = new EnemyBookTranslator();
    await t.precomputeCounts();
    expect([...t.entries.keys()]).toEqual([first, second]);
    const r = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => type + ':' + text,
        translationCache: new Map([['plugin_enemy_book:' + first, 'A watery monster.']]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.collectUntranslated({ runtime: r }).map((item) => item.value)).toEqual([second]);
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Window_EnemyBookStatus().drawTextEx(enemy.meta.desc1)).toBe('A watery monster.');
    expect(new BaseWindow().drawTextEx(first)).toBe(first);
    expect(enemy.meta.desc1).toBe(first);
    expect(r.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_enemy_book:' + first,
        expect.anything()
    );
});
