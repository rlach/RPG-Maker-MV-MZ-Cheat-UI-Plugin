import { afterEach, expect, it, vi } from 'vitest';
import { LLInfoPopupWIndowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LLInfoPopupWIndowTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('catalogs MV and MZ payloads without command settings', () => {
    const translator = new LLInfoPopupWIndowTranslator();
    translator.collectCommandTexts([
        { code: 356, parameters: ['LL_InfoPopupWIndowMV showWindow \\I[14]Village 300 11 11 0'] },
        { code: 356, parameters: ['LL_InfoPopupWIndowMV showWindow \\I[14]Village 180 0 60 2'] },
        { code: 356, parameters: ['OtherPlugin showWindow Ignore 180 0 0 0'] },
        { code: 356, parameters: ['LL_InfoPopupWIndowMV hideWindow Ignore'] },
        {
            code: 357,
            parameters: ['LL_InfoPopupWIndow', 'showMessage', '', { messageText: 'MZ popup' }],
        },
    ]);
    expect([...translator.entries.keys()]).toEqual(['\\I[14]Village', 'MZ popup']);
});

it('translates MV before layout, preserving spaced translations, options and original seen keys', () => {
    const original = vi.fn((command, args) => args);
    class Interpreter {}
    Interpreter.prototype.pluginCommand = original;
    vi.stubGlobal('window', {
        $plugins: [{ name: 'LL_InfoPopupWIndowMV', status: true }],
        Game_Interpreter: Interpreter,
    });
    const translator = new LLInfoPopupWIndowTranslator();
    let enabled = true;
    const source = '\\I[14]Village';
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (key) => runtime.translationCache.has(key),
        translationCache: new Map([[source, '\\I[14]Head to the village']]),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.detectPlugin()).toBe(true);
    expect(translator.enablePluginTranslation()).toBe(true);
    const interpreter = new Interpreter();
    const args = ['showWindow', source, '300', '11', '11', '0'];
    expect(interpreter.pluginCommand('LL_InfoPopupWIndowMV', args)).toEqual([
        'showWindow',
        '\\I[14]Head to the village',
        '300',
        '11',
        '11',
        '0',
    ]);
    expect(args[1]).toBe(source);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(source, expect.anything());
    runtime.trackCacheKeyUsage.mockClear();
    enabled = false;
    expect(interpreter.pluginCommand('LL_InfoPopupWIndowMV', args)).toBe(args);
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    enabled = true;
    runtime.translationCache.clear();
    expect(interpreter.pluginCommand('LL_InfoPopupWIndowMV', args)).toEqual(args);
    expect(interpreter.pluginCommand('OtherPlugin', args)).toBe(args);
});

it('keeps the MZ showMessage hook working', () => {
    const original = vi.fn((args) => args);
    vi.stubGlobal('window', {
        $plugins: [],
        PluginManager: { _commands: { 'LL_InfoPopupWIndow:showMessage': original } },
    });
    const translator = new LLInfoPopupWIndowTranslator();
    vi.spyOn(translator, 'registerPluginCustomTags').mockImplementation(() => {});
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    vi.spyOn(translator, 'getRuntime').mockReturnValue({ isTranslationEnabled: () => true });
    vi.spyOn(translator, 'resolveRuntimeTranslation').mockReturnValue('Translated popup');
    expect(translator.enablePluginTranslation()).toBe(true);
    const args = { messageText: 'Original popup', duration: '180' };
    expect(window.PluginManager._commands['LL_InfoPopupWIndow:showMessage'](args)).toEqual({
        messageText: 'Translated popup',
        duration: '180',
    });
    expect(args.messageText).toBe('Original popup');
});
