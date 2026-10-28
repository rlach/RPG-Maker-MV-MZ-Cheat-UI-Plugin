import { afterEach, expect, it, vi } from 'vitest';
import { MogEventIndicatorsTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MogEventIndicatorsTranslator.js';
afterEach(() => vi.unstubAllGlobals());
it('scans comment labels and MZ commands, excluding images and numeric indicators', () => {
    const translator = new MogEventIndicatorsTranslator();
    translator.collectCommandTexts([
        { code: 108, parameters: ['text_indicator : 記憶空間'] },
        { code: 108, parameters: ['variable_indicator : 5'] },
        { code: 108, parameters: ['indicator : image_name'] },
        {
            code: 357,
            parameters: [
                'MOG_EventIndicators',
                'Text_Indicator',
                '',
                { text: '休憩', image: 'bed' },
            ],
        },
    ]);
    expect([...translator.entries.keys()]).toEqual(['記憶空間', '休憩']);
});
it('translates rendered labels and seen keys without changing indicator data or variable values', () => {
    vi.stubGlobal('window', globalThis);
    class Bitmap {
        drawText(text) {
            this.drawn = text;
        }
        clear() {}
    }
    class Indicator {
        _text = { bitmap: new Bitmap() };
        settings = { mode: 1, text: '記憶空間' };
        data() {
            return this.settings;
        }
        refreshText() {
            this._text.bitmap.drawText(this.data().mode === 1 ? this.data().text : 42);
        }
        needRefreshText() {
            return false;
        }
    }
    vi.stubGlobal('EventIndicators', Indicator);
    const translator = new MogEventIndicatorsTranslator();
    const runtime = {
        getCacheKey: (text) => text,
        hasUsableCacheValue: () => true,
        translationCache: new Map([['記憶空間', 'Memory Space']]),
        trackCacheKeyUsage: vi.fn(),
    };
    translator.getRuntime = () => runtime;
    translator.isRuntimeTranslationActive = () => true;
    translator.precomputeCounts = async () => {};
    expect(translator.enablePluginTranslation()).toBe(true);
    const indicator = new Indicator();
    indicator.refreshText();
    expect(indicator._text.bitmap.drawn).toBe('Memory Space');
    expect(indicator.settings.text).toBe('記憶空間');
    expect(Object.hasOwn(indicator._text.bitmap, 'drawText')).toBe(false);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith('記憶空間', expect.anything());
    expect(indicator.needRefreshText()).toBe(false);
    runtime.translationCache.set('記憶空間', 'Updated label');
    expect(indicator.needRefreshText()).toBe(true);
    indicator.refreshText();
    expect(indicator._text.bitmap.drawn).toBe('Updated label');
    indicator.settings.mode = 2;
    indicator.refreshText();
    expect(indicator._text.bitmap.drawn).toBe(42);
});
