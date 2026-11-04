import { expect, it } from 'vitest';
import { TrpCustomWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TrpCustomWindowTranslator.js';
import { GachaTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/GachaTranslator.js';

it('extracts text-part templates and switch branches while leaving IDs and pictures alone', () => {
    const translator = new TrpCustomWindowTranslator();
    const commands = [
        'ウィンドウ パーツ登録 ターンウィンドウ ヘッダー 0 0 残り',
        'ウィンドウ パーツ作成 ターン テキスト 110 60 \\V[52]ターン',
        'ウィンドウ パーツ作成 絵 画像 110 60 日本語画像',
        'ウィンドウ パーツ登録 歩数ウィンドウ ヘッダー 0 0 あと',
        'ウィンドウ パーツ登録 ダイスウィンドウ 回数 0 0 \\S[23]あと\\V[73]回:あと∞回\\S',
    ];
    translator.collectCommandTexts(commands.map((text) => ({ code: 356, parameters: [text] })));
    expect([...translator.entries.keys()]).toEqual([
        '残り',
        '\\COT[0]ターン',
        'あと',
        'あと\\COT[0]回',
        'あと∞回',
    ]);
    const entry = translator.entries.get('\\COT[0]ターン');
    translator.templates = [{ ...entry, pattern: /^(.*?)ターン$/ }];
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: {},
        getCacheKey: (text) => text,
        translationCache: new Map([[entry.text, '\\COT[0] turns']]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage() {},
    };
    translator.tagEngine = runtime.engine;
    expect(translator.resolveText('16ターン', runtime)).toBe('16 turns');
    runtime.enabled = false;
    expect(translator.resolveText('16ターン', runtime)).toBe('16ターン');
});

it('collects Gacha captions and dynamic display placeholders without costs or effects', () => {
    const translator = new GachaTranslator();
    translator.collectParameterTexts({
        'Help Message Text': 'ガチャを引きます',
        'Button Text': 'ガチャを引く',
        'Cost Unit': '回',
        'Required Amount': '100',
        Effect: '119',
        'Get Message Text': 'GET Item Name',
    });
    expect([...translator.entries.keys()]).toEqual([
        'ガチャを引きます',
        'ガチャを引く',
        'GET \\COT[0]',
        '回',
    ]);
});
