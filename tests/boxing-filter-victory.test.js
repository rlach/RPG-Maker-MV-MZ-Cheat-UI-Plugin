import { afterEach, expect, it, vi } from 'vitest';
import { textFitsVisibleBox } from '../cheat-engine/www/cheat/js/translation-runtime/TextWrap.js';
import { DescriptionsCleanup } from '../cheat-engine/www/cheat/translate-engines/translation-phases/DescriptionsCleanup.js';
import { YepVictoryAftermathTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/YepVictoryAftermathTranslator.js';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('only sends overflowing translated entries from selected types and language pair', () => {
    const runtime = { sourceLang: 'ja', targetLang: 'en', descriptionMaxLineWidth: 20, descriptionMaxRows: 2,
        translationCache: new Map([
            ['message:ja-en-fit', 'Fits here.'], ['message:ja-en-width', 'A sentence that exceeds the allowed width.'],
            ['message:ja-en-rows', 'One\nTwo\nThree'], ['message:ja-en-empty', ''],
            ['command:ja-en-other', 'word '.repeat(20)], ['message:ja-pl-other', 'word '.repeat(20)]
        ]) };
    const phase = new DescriptionsCleanup(); phase.configure(['message'], '');
    expect(phase.collectUntranslated({ runtime }).map(item => item.cacheKey)).toEqual(['message:ja-en-width', 'message:ja-en-rows']);
    expect(runtime.translationCache.get('message:ja-en-fit')).toBe('Fits here.');
});
it('counts visible width, fullwidth characters, font changes and long unbroken words', () => {
    expect(textFitsVisibleBox('12345', 5, 1)).toBe(true);
    expect(textFitsVisibleBox('123456', 5, 1)).toBe(false);
    expect(textFitsVisibleBox('日本語', 5, 1)).toBe(false);
    expect(textFitsVisibleBox('\\{1234', 5, 1, { fontScaleWidthMultiplier: 0.5 })).toBe(false);
});
it('scans original enabled victory parameters only and translates result/drop/EXP output without mutating them', async () => {
    vi.stubGlobal('window', globalThis);
    const parameters = { 'Battle Results Text': '- 戦闘結果 -', 'Battle Drops Text': '- 拾得品 -', 'Level Up Text': 'レベルアップ！', 'Max Level Text': 'レベル上限', 'Gained EXP Text': '入手経験値', 'Gained EXP Format': '+%1', 'Victory BGM': '音楽' };
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => 'var $plugins = ' + JSON.stringify([{ name: 'YEP_VictoryAftermath', status: true, parameters }]) + ';' }));
    const t = new YepVictoryAftermathTranslator(); await t.precomputeCounts();
    expect(t.entries.size).toBe(6); expect(t.entries.has('音楽')).toBe(false);
    const runtime = { enabled: true, isTranslationEnabled() { return this.enabled; }, engine: { addPluginTags() {} }, getCacheKey: (text, type) => type + ':' + text, trackCacheKeyUsage: vi.fn(), translationCache: new Map([['plugin_yep_victory_aftermath:- 戦闘結果 -', '- Battle Results -']]), hasUsableCacheValue(key) { return this.translationCache.has(key); } };
    vi.spyOn(t, 'registerPluginCustomTags').mockImplementation(() => {});
    expect(t.resolveText(parameters['Battle Results Text'], runtime)).toBe('- Battle Results -');
    expect(t.resolveText('- Battle Results -', runtime)).toBe('- Battle Results -');
    await t.precomputeCounts();
    expect(t.entries.has('- Battle Results -')).toBe(false);
    expect(parameters['Battle Results Text']).toBe('- 戦闘結果 -');
    runtime.enabled = false;
    expect(t.resolveText(parameters['Battle Results Text'], runtime)).toBe('- 戦闘結果 -');
});
