import { afterEach, expect, it, vi } from 'vitest';
import { VisuVisualTextWindowsTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/VisuVisualTextWindowsTranslator.js';
import { VisuSideChatterTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/VisuSideChatterTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it.each([VisuVisualTextWindowsTranslator, VisuSideChatterTranslator])(
    'collects JSON text for %s and tracks original keys before native layout',
    (Translator) => {
        vi.stubGlobal('window', globalThis);
        const translator = new Translator();
        const source = 'なんだよ、今日はやけに早いじゃん。\nバイトは？ 行かなかったのか？';
        const args = {
            'id:num': '6',
            'text:json': JSON.stringify(source),
            'Customize:struct': '{"width:str":"auto","x:str":"$gameVariables.value(23)"}',
        };
        const command = translator.getTextCommandName();
        translator.collectCommandTexts([
            { code: 357, parameters: [translator.getPluginName(), command, '', args] },
            { code: 357, parameters: ['OtherPlugin', command, '', { 'text:json': '"Other"' }] },
            { code: 657, parameters: ['Text = "truncated preview…"'] },
            {
                code: 357,
                parameters: [translator.getPluginName(), command, '', { 'text:json': 'bad JSON' }],
            },
        ]);
        expect([...translator.entries.keys()]).toEqual([source]);
        const used = vi.fn();
        let enabled = true;
        const translated = 'You are early.\nDid you skip work?';
        const runtime = {
            isTranslationEnabled: () => enabled,
            getCacheKey: (text, type) => type + ':' + text,
            trackCacheKeyUsage: used,
            translationCache: new Map([[translator.getCacheType() + ':' + source, translated]]),
            hasUsableCacheValue(key) {
                return this.translationCache.has(key);
            },
        };
        vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
        const native = vi.fn((_self, _plugin, _command, data) => JSON.parse(data['text:json']));
        vi.stubGlobal('PluginManager', { callCommand: native });
        expect(translator.enablePluginTranslation()).toBe(true);
        expect(PluginManager.callCommand({}, translator.getPluginName(), command, args)).toBe(
            translated
        );
        expect(native.mock.calls[0][3]['Customize:struct']).toBe(args['Customize:struct']);
        expect(args['text:json']).toBe(JSON.stringify(source));
        expect(used).toHaveBeenCalledWith(translator.getCacheType() + ':' + source, {
            harvestMissing: true,
        });
        enabled = false;
        used.mockClear();
        expect(PluginManager.callCommand({}, translator.getPluginName(), command, args)).toBe(
            source
        );
        expect(used).not.toHaveBeenCalled();
    }
);
