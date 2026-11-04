import { expect, it } from 'vitest';
import { TMCardTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TMCardTranslator.js';
import { extractJavaScriptTextCatalog } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';

it('collects deck labels and opponent display names without numeric or asset parameters', () => {
    const translator = new TMCardTranslator();
    translator.collectParameterTexts({
        deckNames: 'デッキＡ デッキＢ',
        paramNames: 'コスト ＨＰ',
        commandDeckEdit: 'デッキ編集',
        picture: '画像',
        vnResult: '1',
    });
    translator.collectCommandTexts([{ code: 356, parameters: ['startDeckSelect キーナ 0 1,2,3'] }]);
    expect([...translator.entries.keys()].sort()).toEqual(
        ['デッキＡ', 'デッキＢ', 'コスト', 'ＨＰ', 'デッキ編集', 'キーナ'].sort()
    );
});

it('extracts dynamic turn/cost templates and resolves translated names without harvesting rendered output', () => {
    const translator = new TMCardTranslator();
    translator.extractCatalog = extractJavaScriptTextCatalog;
    const catalog = translator.collectSourceCatalog(`
        this.addMessage(0, attacker.userName() + 'のターン');
        this.addMessage(1, 5);
        this.drawText('合計' + costLabel + ': ' + cost, 0, 0);
        this.setText('編集するデッキを選択してください。');
        ImageManager.loadPicture('カード画像');
    `);
    expect(catalog.entries.map((entry) => entry.text)).toContain(
        '編集するデッキを選択してください。'
    );
    expect(catalog.entries.map((entry) => entry.text)).not.toContain('カード画像');
    const turn = catalog.entries.find((entry) => entry.text.endsWith('のターン'));
    expect(turn.parts).toEqual(['', 'のターン']);
    translator.templates = [{ ...turn, pattern: /^([\s\S]*?)のターン$/ }];
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags() {} },
        getCacheKey: (text) => text,
        translationCache: new Map([[turn.text, "\\COT[0]'s turn"]]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage() {},
    };
    translator.tagEngine = runtime.engine;
    expect(translator.resolveText('Nimanのターン', runtime)).toBe("Niman's turn");
    runtime.enabled = false;
    expect(translator.resolveText('Nimanのターン', runtime)).toBe('Nimanのターン');
});
