import { afterEach, expect, it, vi } from 'vitest';
import { DbMenuStatusTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DbMenuStatusTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('catalogs literal labels and translates only the menu-status drawing surface', async () => {
    class Status {
        drawText(text, ...args) {
            return [text, ...args];
        }
        drawItem() {}
    }
    const originalDrawItem = Status.prototype.drawItem;
    vi.stubGlobal('window', {
        Window_MenuStatus: Status,
        $plugins: [{ name: 'DB_menustatus', status: true, parameters: {} }],
    });
    const source = `Window_MenuStatus.prototype.drawItem = function() {
        this.drawText($gameActors.actor(2).name(), 10, 10, 300, 'right');
        this.drawText('状態一', 10, 200, 300, 'right');
        this.drawText($gameVariables.value(9), 10, 230, 300, 'right');
        this.drawText('状態二', 10, 260, 300, 'right');
        this.drawText('状態三', 10, 320, 300, 'right');
        ImageManager.loadBitmap('img/pictures/', 'menuactor');
    };`;
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, text: async () => source }))
    );
    const translator = new DbMenuStatusTranslator();
    expect(translator.detectPlugin()).toBe(true);
    await translator.precomputeCounts();
    expect([...translator.entries.keys()]).toEqual(['状態一', '状態二', '状態三']);
    let enabled = true;
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([['plugin_db_menu_status:状態一', 'First statistic']]),
        hasUsableCacheValue: (key) => runtime.translationCache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const display = new Status();
    expect(display.drawText('状態一', 10, 200, 300, 'right')).toEqual([
        'First statistic',
        10,
        200,
        300,
        'right',
    ]);
    expect(display.drawText('Actor name')).toEqual(['Actor name']);
    expect(display.drawText(0)).toEqual([0]);
    expect(Status.prototype.drawItem).toBe(originalDrawItem);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(1);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_db_menu_status:状態一',
        expect.anything()
    );
    expect(translator.getCachedCountsSync({ runtime }).leftStrings).toBe(2);
    enabled = false;
    expect(display.drawText('状態一')).toEqual(['状態一']);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(1);
});

it('waits for the menu-status window class', () => {
    vi.stubGlobal('window', {});
    expect(new DbMenuStatusTranslator().enablePluginTranslation()).toBe(false);
});
