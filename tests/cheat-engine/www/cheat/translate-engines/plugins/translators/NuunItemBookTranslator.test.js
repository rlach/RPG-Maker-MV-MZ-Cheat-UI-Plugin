import { afterEach, expect, it, vi } from 'vitest';
import { NuunItemBookTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NUUN_ItemBookTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('catalogs detail defaults and configured labels, translating only encyclopedia presentation', () => {
    class Window_Base {
        drawText(text) { return text; }
    }
    class Window_Command extends Window_Base {
        addCommand() {}
    }
    class Window_MenuCommand extends Window_Command {
        addOriginalCommands() {}
    }
    class Window_ItemBook extends Window_Base {}
    vi.stubGlobal('window', {
        Window_Base, Window_Command, Window_MenuCommand,
        PluginManager: { parameters: () => ({ ItemPageSetting: JSON.stringify([{ paramName: 'Custom owned label' }]) }) },
    });
    const translator = new NuunItemBookTranslator();
    vi.spyOn(translator, 'findPluginEntry').mockReturnValue(null);
    translator._scanEntries = translator.buildScanEntries();
    let enabled = true;
    const translations = new Map([
        ['所持数', 'Owned'], ['常時', 'Always'], ['戦闘時', 'In battle'],
        ['移動時', 'Outside battle'], ['使用不可', 'Never'],
        ['消耗する', 'Consumed'], ['消耗しない', 'Not consumed'],
        ['Custom owned label', 'Custom translation'],
    ]);
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: text => text,
        hasUsableCacheValue: key => translations.has(key),
        translationCache: translations,
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    const pending = translator.collectUntranslated({ runtime: { ...runtime, hasUsableCacheValue: () => false } });
    for (const text of translations.keys()) expect(pending.some(item => item.value === text)).toBe(true);
    expect(translator.enablePluginTranslation()).toBe(true);
    const book = new Window_ItemBook();
    for (const [source, target] of translations) expect(book.drawText(source)).toBe(target);
    runtime.trackCacheKeyUsage.mockClear();
    expect(book.drawText('123')).toBe('123');
    expect(book.drawText('An item name')).toBe('An item name');
    expect(new Window_Base().drawText('所持数')).toBe('所持数');
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    enabled = false;
    expect(book.drawText('移動時')).toBe('移動時');
});
