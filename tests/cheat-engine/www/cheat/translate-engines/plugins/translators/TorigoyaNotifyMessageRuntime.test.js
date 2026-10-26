import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { TorigoyaNotifyMessageTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TorigoyaNotifyMessageTranslator.js';
import { withTranslatedNotification } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/NotificationTranslationContext.js';
import { TagManager } from '../../../../../../../cheat-engine/www/cheat/translate-engines/ai-engine/TagManager.js';
let runtime;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('__CHEAT_TORIGOYA_NOTIFY_MESSAGE_TRANSLATOR_HOOKED__', false);
    vi.stubGlobal('$plugins', []);
    runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => type + ':' + text,
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
});
afterEach(() => vi.unstubAllGlobals());
function setup(key = 'NotifyMessage') {
    class Item {
        constructor(message) {
            this.message = message;
            this.openness = 0;
        }
    }
    class Window {
        setup(item) {
            this.item = item;
            this.shown = item.message;
        }
    }
    const windows = [];
    const parts = [];
    const manager = {
        notify(item) {
            for (const message of item.message.split('\n')) {
                const part = new Item(message);
                parts.push(part);
                const win = new Window();
                win.setup(part);
                windows.push(win);
            }
        },
    };
    const addon = {
        parameter: {
            baseGainSingleMessage: '\\C[2]\\name\\C[0]を入手！',
            baseGainMultiMessage: '\\C[2]\\name\\C[0]×\\countを入手！',
            baseGainMoneyMessage: '\\gold円を入手！',
        },
        notifyGainItem(item, count) {
            const template =
                this.parameter[count === 1 ? 'baseGainSingleMessage' : 'baseGainMultiMessage'];
            manager.notify(
                new Item(template.replace(/\\name/, item.name).replace(/\\count/, count))
            );
        },
        notifyGainMoney(gold) {
            manager.notify(new Item(this.parameter.baseGainMoneyMessage.replace(/\\gold/, gold)));
        },
    };
    vi.stubGlobal('Torigoya', { [key]: { Window, Manager: manager, Addons: { GetItem: addon } } });
    const translator = new TorigoyaNotifyMessageTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    return { translator, manager, Item, Window, addon, windows, parts };
}
function cache(text, value) {
    runtime.translationCache.set('plugin_torigoya_notify_message:' + text, value);
}

it.each(['NotifyMessage', 'NotifyMessageZ'])(
    'translates complete %s notifications once before splitting and preserves item/animation state',
    (key) => {
        const { manager, Item, windows, parts } = setup(key);
        cache('原文一\n原文二', 'First\nSecond');
        const item = new Item('原文一\n原文二');
        manager.notify(item);
        expect(windows.map((w) => w.shown)).toEqual(['First', 'Second']);
        expect(item.message).toBe('原文一\n原文二');
        expect(runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual([
            'plugin_torigoya_notify_message:原文一\n原文二',
        ]);
        parts[0].openness = 125;
        expect(windows[0].item.openness).toBe(125);
        windows[0].item.message = 'Changed display';
        expect(parts[0].message).toBe('First');
        manager.notify(item);
        expect(item.message).toBe('原文一\n原文二');
    }
);

it('harvests missing complete sources, skips producer-owned output and obeys disabled mode', () => {
    const { manager, Item, windows } = setup();
    manager.notify(new Item('未訳一\n未訳二'));
    expect(runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual([
        'plugin_torigoya_notify_message:未訳一\n未訳二',
    ]);
    runtime.trackCacheKeyUsage.mockClear();
    withTranslatedNotification(() =>
        manager.notify(new Item('Already translated dynamically: 123'))
    );
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    cache('原文', 'Translated');
    manager.notify(new Item('原文'));
    runtime.trackCacheKeyUsage.mockClear();
    manager.notify(new Item('Translated'));
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    runtime.enabled = false;
    manager.notify(new Item('原文'));
    expect(windows.at(-1).shown).toBe('原文');
});

it('collects and translates GetItem templates before substitutions, without harvesting rendered names/counts', async () => {
    const { translator, addon, windows } = setup();
    const originals = { ...addon.parameter };
    cache(originals.baseGainSingleMessage, 'Obtained \\C[2]\\name\\C[0]!');
    cache(originals.baseGainMultiMessage, 'Obtained \\C[2]\\name\\C[0] x\\count!');
    cache(originals.baseGainMoneyMessage, 'Obtained \\gold yen!');
    addon.notifyGainItem({ name: 'Turnip' }, 1);
    addon.notifyGainItem({ name: 'Turnip' }, 10);
    addon.notifyGainMoney(50);
    expect(windows.map((w) => w.shown)).toEqual([
        'Obtained \\C[2]Turnip\\C[0]!',
        'Obtained \\C[2]Turnip\\C[0] x10!',
        'Obtained 50 yen!',
    ]);
    expect(addon.parameter).toEqual(originals);
    expect(runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual(
        Object.values(originals).map((s) => 'plugin_torigoya_notify_message:' + s)
    );
    vi.spyOn(translator, 'collectCommonEventEntries').mockImplementation(() => {});
    vi.spyOn(translator, 'collectTroopEntries').mockImplementation(() => {});
    vi.spyOn(translator, 'collectMapEntries').mockResolvedValue();
    expect((await translator.buildScanEntries()).map((e) => e.text)).toEqual(
        Object.values(originals)
    );
    const tm = new TagManager(null);
    tm.setCustomTagConfigs(runtime.engine.addPluginTags.mock.calls.flatMap(([, tags]) => tags));
    const encoded = tm.preprocessTags(originals.baseGainMultiMessage);
    expect(encoded.preprocessedText).not.toContain('\\name');
    expect(encoded.preprocessedText).not.toContain('\\count');
    expect(
        tm.postprocessTags(encoded.preprocessedText, encoded.tagCounts, encoded.caseMap).text
    ).toBe(originals.baseGainMultiMessage);
});
