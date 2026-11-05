import { afterEach, expect, it, vi } from 'vitest';
import { MMChoiceButtonExTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MMChoiceButtonExTranslator.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('scans nested command overrides and external presets without collecting scripts or asset names', async () => {
    const translator = new MMChoiceButtonExTranslator();
    const overrides = JSON.stringify([
        JSON.stringify({
            index: '1',
            text: '──支配されたい。',
            script: 'sourceScript()',
            imageName: 'button',
        }),
    ]);
    translator.collectCommandTexts([
        {
            code: 357,
            parameters: [
                'MM_ChoiceButtonEx',
                'showChoicePreset',
                '',
                { buttonOverrides: overrides },
            ],
        },
        { code: 357, parameters: ['Other', 'showChoicePreset', '', { text: 'unrelated' }] },
    ]);
    vi.spyOn(translator, 'findPluginEntry').mockReturnValue({
        parameters: { presetDataFile: 'custom/presets.json' },
    });
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValue({
                ok: true,
                text: async () =>
                    JSON.stringify({
                        presets: [
                            {
                                id: 'choice1',
                                choices: [{ text: '──溺れたい。', value: 'sourceValue' }],
                            },
                        ],
                    }),
            })
    );
    await translator.collectAdditionalTexts();
    expect(fetch).toHaveBeenCalledWith('custom/presets.json');
    expect([...translator.entries.keys()]).toEqual(['──支配されたい。', '──溺れたい。']);
});

it('translates choice and panel labels before layout, tracks seen and preserves source configuration', () => {
    const show = vi.fn((config) => config);
    const manager = { showChoice: show, showPanel: show };
    vi.stubGlobal('window', { MMChoiceButtonEx: { Manager: manager } });
    const translator = new MMChoiceButtonExTranslator();
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => type + ':' + text,
        trackCacheKeyUsage: vi.fn(),
        translationCache: new Map([
            ['plugin_mm_choice_button_ex:──支配されたい。', 'I want to submit.'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const choice = {
        text: '──支配されたい。',
        value: 7,
        script: 'sourceScript()',
        commonEventId: 55,
    };
    const config = { choices: [choice], visual: { textPadding: 10 } };
    for (const method of ['showChoice', 'showPanel']) {
        const result = manager[method](config);
        expect(result.choices[0]).toEqual({ ...choice, text: 'I want to submit.' });
        expect(result.visual).toBe(config.visual);
    }
    expect(choice.text).toBe('──支配されたい。');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_mm_choice_button_ex:──支配されたい。',
        { harvestMissing: true }
    );
    runtime.enabled = false;
    expect(manager.showChoice(config)).toBe(config);
});
