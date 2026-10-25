import { afterEach, expect, it, vi } from 'vitest';
import { LLMenuScreenShopTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LLMenuScreenShopTranslator.js';

afterEach(() => vi.unstubAllGlobals());

function setup() {
    vi.stubGlobal('window', globalThis);
    const runtime = {
        enabled: true,
        isTranslationEnabled: () => runtime.enabled,
        getCacheKey: (text, type) => `${type}:ja-en-${text}`,
        translationCache: new Map(),
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
    };
    const translator = new LLMenuScreenShopTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return { translator, runtime };
}

it('scans all clerks and all message fields, deduplicating only exact texts', () => {
    const { translator, runtime } = setup();
    const shop = {
        commandMessage: JSON.stringify('Welcome\n\\V[1]'),
        buyMessage: JSON.stringify('Buy'),
        sellMessage: JSON.stringify('Sell'),
        thanksMessage: JSON.stringify('Thanks'),
        staffImageName: 'Do not translate',
        backgroundImage: 'Background',
    };
    vi.stubGlobal('$plugins', [
        {
            name: 'LL_MenuScreenShopMV',
            status: true,
            parameters: {
                shopLists: JSON.stringify([
                    JSON.stringify(shop),
                    JSON.stringify({ ...shop, buyMessage: JSON.stringify('Other clerk') }),
                ]),
            },
        },
    ]);
    translator.precomputeCounts();
    translator.precomputeCounts();
    const items = translator.collectUntranslated({ runtime });
    expect(items.map((item) => item.value)).toEqual([
        'Welcome\n\\V[1]',
        'Buy',
        'Sell',
        'Thanks',
        'Other clerk',
    ]);
    runtime.translationCache.set(items[0].cacheKey, 'Hello');
    expect(translator.getCachedCountsSync({ runtime })).toEqual({
        total: 5,
        left: 4,
        totalStrings: 5,
        leftStrings: 4,
    });
    for (const item of items) runtime.translationCache.set(item.cacheKey, 'Translated');
    expect(translator.collectUntranslated({ runtime })).toEqual([]);
    expect(translator.getCachedCountsSync({ runtime })).toEqual({
        total: 5,
        left: 0,
        totalStrings: 5,
        leftStrings: 0,
    });
});

it('translates private shop windows with JSON, tracks usage, and preserves source on miss or disabled mode', () => {
    const { translator, runtime } = setup();
    class Shop {
        createMessageWindow() {
            this._messageWindow = {
                setText(text) {
                    this._text = JSON.parse(text || 'null');
                },
            };
            return 42;
        }
    }
    vi.stubGlobal('Scene_Shop', Shop);
    expect(translator.enablePluginTranslation()).toBe(true);
    const shop = new Shop();
    expect(shop.createMessageWindow()).toBe(42);
    const source = 'Welcome\n\\V[1]';
    const key = runtime.getCacheKey(source, translator.getCacheType());
    const translated = 'Hello "friend"\n\\V[1]';
    runtime.translationCache.set(key, translated);
    shop._messageWindow.setText(JSON.stringify(source));
    expect(shop._messageWindow._text).toBe(translated);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(key, { harvestMissing: true });
    shop._messageWindow.setText(JSON.stringify('Missing'));
    expect(shop._messageWindow._text).toBe('Missing');
    runtime.enabled = false;
    shop._messageWindow.setText(JSON.stringify(source));
    expect(shop._messageWindow._text).toBe(source);
    shop._messageWindow.setText('');
    expect(shop._messageWindow._text).toBeNull();
});

it('waits for the plugin-specific scene method', () => {
    const { translator } = setup();
    vi.stubGlobal('Scene_Shop', class {});
    expect(translator.enablePluginTranslation()).toBe(false);
});
