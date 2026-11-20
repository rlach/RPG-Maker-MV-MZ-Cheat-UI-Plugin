import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventUiTextTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/EventUiTextTranslator.js';
import { MogMapNameHudTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MogMapNameHudTranslator.js';
let runtime;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    runtime = { isTranslationEnabled: () => true, engine: { addPluginTags: vi.fn() },
        getCacheKey: (text, type) => `${type}:${text}`, trackCacheKeyUsage: vi.fn(),
        translationCache: new Map([['plugin_event_ui_text:0', 'El Grande Princess'], ['plugin_event_ui_text:0ml', 'Bad measurement'], ['plugin_event_ui_text:初心者', 'Novice']]),
        hasUsableCacheValue(key) { return this.translationCache.has(key); } };
});
afterEach(() => vi.unstubAllGlobals());
it('ignores polluted numeric caches for counts, amounts, units and individual glyphs', () => {
    const t = new EventUiTextTranslator();
    for (const text of ['0', '1', '1000', '0ml', '0 ml', '12.5ml', '\\C[2]0']) {
        expect(t.resolveText(text, runtime)).toBe(text);
        expect(t.isUsableText(text)).toBe(false);
    }
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    t.entries.set('初心者', { text: '初心者' });
    expect(t.resolveText('初心者', runtime)).toBe('Novice');
});
it('follows variable-only displays to string assignments but excludes numeric literals from the catalog', async () => {
    const t = new EventUiTextTranslator();
    t.extractCatalog = () => ({ entries: [{ text: '0' }, { text: '初心者' }] });
    t.collectCommandTexts([{ code: 356, parameters: ['D_TEXT \\V[241] 16'] }, { code: 122, parameters: [241, 241, 0, 4, '"初心者"'] }]);
    await t.collectAdditionalTexts();
    expect(t.displayVariables.has(241)).toBe(true);
    expect([...t.entries.keys()]).toEqual(['初心者']);
});
it.each(['name', 'mapName'])('supports the MOG %s variant without changing the source name', (method) => {
    class MapHud { }
    MapHud.prototype[method] = () => '港町';
    vi.stubGlobal('Map_Name_Hud', MapHud);
    const t = new MogMapNameHudTranslator();
    t.getRuntime = () => runtime;
    runtime.translationCache.set('map_name:港町', 'Port Town');
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new MapHud()[method]()).toBe('Port Town');
    expect(t.resolveRuntimeTranslation('港町', runtime, 'map_name')).toBe('Port Town');
});
