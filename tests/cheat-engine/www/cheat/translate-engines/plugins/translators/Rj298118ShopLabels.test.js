import { afterEach, expect, it, vi } from 'vitest';
import { KmsShopInventoryTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/KmsShopInventoryTranslator.js';
import { NyaLuggageCapacityTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NyaLuggageCapacityTranslator.js';
import { SourceTextCatalogTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it.each([
    [
        KmsShopInventoryTranslator,
        'KMS_ShopInventory',
        { 'Caption for stock': 'Stock', 'Sold out text': 'Sold out', 'Stock display': '1' },
        ['Stock', 'Sold out'],
    ],
    [
        NyaLuggageCapacityTranslator,
        'PNDK_LuggageCapacity',
        {
            'Attribute name': 'Weight',
            Unit: 'W',
            'Carry point': '\\v[16]',
            'Excess handling': 'Choice',
        },
        ['Weight', 'W'],
    ],
])(
    'catalogs only display parameters and translates measurement with original-key seen tracking',
    async (Translator, name, parameters, expected) => {
        class BaseWindow {
            textWidth(text) {
                return text.length;
            }
            drawText(text) {
                return text;
            }
        }
        vi.stubGlobal('window', {
            $plugins: [{ name, status: true, parameters }],
            Window_Base: BaseWindow,
        });
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: true, text: async () => '' }))
        );
        const translator = new Translator();
        expect(translator.detectPlugin()).toBe(true);
        await translator.precomputeCounts();
        expect([...translator.entries.keys()]).toEqual(expected);
        const source = expected[0];
        let enabled = true;
        const runtime = {
            isTranslationEnabled: () => enabled,
            getCacheKey: (text, type) => `${type}:${text}`,
            translationCache: new Map([
                [`${translator.getCacheType()}:${source}`, 'Translated label'],
            ]),
            hasUsableCacheValue: (key) => runtime.translationCache.has(key),
            trackCacheKeyUsage: vi.fn(),
        };
        vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
        vi.spyOn(
            SourceTextCatalogTranslator.prototype,
            'enablePluginTranslation'
        ).mockImplementation(function () {
            this.hookDrawing(BaseWindow.prototype, 'drawText');
            return true;
        });
        expect(translator.enablePluginTranslation()).toBe(true);
        const display = new BaseWindow();
        expect(display.textWidth(source)).toBe('Translated label'.length);
        expect(display.drawText(source)).toBe('Translated label');
        expect(
            runtime.trackCacheKeyUsage.mock.calls.every(
                ([key]) => key === `${translator.getCacheType()}:${source}`
            )
        ).toBe(true);
        expect(translator.getCachedCountsSync({ runtime }).leftStrings).toBe(1);
        expect(Object.values(parameters)).toContain(source);
        enabled = false;
        runtime.trackCacheKeyUsage.mockClear();
        expect(display.textWidth(source)).toBe(source.length);
        expect(display.drawText(source)).toBe(source);
        expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    }
);
