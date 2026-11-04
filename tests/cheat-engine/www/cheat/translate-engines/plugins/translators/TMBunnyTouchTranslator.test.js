import { expect, it } from 'vitest';
import { TMBunnyTouchTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TMBunnyTouchTranslator.js';
import { extractJavaScriptTextCatalog } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';

it('catalogs instructions, timer units and result templates with dynamic scores', () => {
    const translator = new TMBunnyTouchTranslator();
    translator.extractCatalog = extractJavaScriptTextCatalog;
    translator.collectParameterTexts({
        helpTexts: JSON.stringify({
            prestart: '数字をタッチ\\n開始',
            end: 'タッチ完了!\\n所要時間: %1秒 (ミス%2回 x %3秒)',
        }),
        helpCalcTexts: JSON.stringify({ prestart: '計算してください' }),
        stateText: '%1/%2回',
        giveupText: '終了',
    });
    const texts = [...translator.entries.keys()];
    expect(texts).toContain('数字をタッチ\n開始');
    expect(texts).toContain('計算してください');
    const result = [...translator.entries.values()].find((entry) =>
        entry.text.startsWith('タッチ完了')
    );
    translator.templates = [
        {
            ...result,
            pattern: /^タッチ完了!\n所要時間: ([\s\S]*?)秒 \(ミス([\s\S]*?)回 x ([\s\S]*?)秒\)$/,
        },
    ];
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: {},
        getCacheKey: (text) => text,
        translationCache: new Map([
            [result.text, 'Done!\nTime: \\COT[0]s (\\COT[1] mistakes x \\COT[2]s)'],
        ]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage() {},
    };
    translator.tagEngine = runtime.engine;
    expect(
        translator.resolveText('タッチ完了!\n所要時間: 14.874秒 (ミス0回 x 1.000秒)', runtime)
    ).toBe('Done!\nTime: 14.874s (0 mistakes x 1.000s)');
    runtime.enabled = false;
    expect(translator.resolveText('終了', runtime)).toBe('終了');
    const catalog = translator.collectSourceCatalog(
        'this.drawText((n / 1000).toFixed(3) + " 秒", 0, 0);'
    );
    expect(catalog.entries.some((entry) => entry.parts?.includes(' 秒'))).toBe(true);
});
