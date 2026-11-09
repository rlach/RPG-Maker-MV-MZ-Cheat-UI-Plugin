import { afterEach, expect, it, vi } from 'vitest';
import { HypnozmStatusTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/HypnozmStatusTranslator.js';
import { extractJavaScriptTextCatalog } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';

afterEach(() => vi.unstubAllGlobals());

it('collects menu expression templates and biography lines without executing scripts', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [{ name: 'LL_MenuScreenCustom', status: true, parameters: {
        rightBlockValue: "$gameVariables.value(142)+'月'+$gameVariables.value(143)+'日'",
        rightBottomBlockValue: "$gameVariables.value(200)+'マナ'",
        leftBottomBlockValue: "'　ランク：'+$gameVariables.value(198)+'　名声上限：'+$gameVariables.value(197)",
    }}]);
    const translator = new HypnozmStatusTranslator();
    translator.extractCatalog = extractJavaScriptTextCatalog;
    translator.entries.set('戦争で一族を失った。\n', {text: '戦争で一族を失った。\n'});
    await translator.collectAdditionalTexts();
    expect(translator.entries.has('戦争で一族を失った。')).toBe(true);
    expect([...translator.entries.keys()].some(text => text.includes('月') && text.includes('\\COT['))).toBe(true);
    expect(translator.entries.has('現在の経験値')).toBe(true);
});

it('translates each assembled status line while preserving dynamic values', () => {
    const translator = new HypnozmStatusTranslator();
    translator.entries.set('経歴。', {text: '経歴。'});
    translator.entries.set('名前：', {text: '名前：'});
    translator.fragmentPattern = /名前：/g;
    const cache = new Map([['経歴。', 'Biography.'], ['名前：', 'Name: ']]);
    const runtime = {isTranslationEnabled: () => true, getCacheKey: text => text,
        trackCacheKeyUsage: vi.fn(), hasUsableCacheValue: text => cache.has(text), translationCache: cache};
    vi.spyOn(translator, 'prepareDynamicValueTag').mockImplementation(() => {});
    expect(translator.resolveText('名前：Inu\n経歴。\n', runtime)).toBe('Name: Inu\nBiography.\n');
});
