import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { EulKzmzUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/EulKzmzUiTranslator.js';

vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);

let translator;
let runtime;
const statusSource = '近況：\\V[9]\n本音を表示します。';
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        {
            name: 'kzmz_SaveMenu',
            status: true,
            parameters: {
                'Detail Text Elements': JSON.stringify([
                    JSON.stringify({
                        data: "'所持金：' + info.gold + 'G'",
                        fontFace: 'Font',
                        background: '画像名',
                    }),
                ]),
            },
        },
        {
            name: 'kzmz_MenuExWindow',
            status: true,
            parameters: {
                'Display Text': JSON.stringify([
                    JSON.stringify({ value: "'現在地：'", background: '画像名' }),
                ]),
            },
        },
        {
            name: 'EUL_Pack06_Utility',
            status: true,
            parameters: {
                M01_targetSwitches: '["2：目標"]',
                M01_todoPrefix: '[T]',
                M01_autoTodo: 'true',
            },
        },
        {
            name: 'EUL_Pack07_VisualFix',
            status: true,
            parameters: {
                M01_TextList: JSON.stringify([
                    JSON.stringify({
                        Text: statusSource,
                        SwitchId: '123',
                        FontFace: 'Font',
                        Image: '画像名',
                    }),
                ]),
            },
        },
    ]);
    vi.stubGlobal('$dataMapInfos', []);
    vi.stubGlobal('$dataCommonEvents', []);
    vi.stubGlobal('$dataSystem', {
        switches: ['', '無関係', '[T] 学園へ向かおう！', '[T] 隠し目標'],
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            text: async () =>
                'const label = "現在の目的"; const defaults = \'{"Text":"JSONコンテナ"}\';',
        }))
    );
    runtime = {
        enabled: true,
        isTranslationEnabled: () => runtime.enabled,
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:ja-en-${text}`,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
    translator = new EulKzmzUiTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
});
afterEach(() => vi.unstubAllGlobals());

function cache(source, translated) {
    runtime.translationCache.set(
        runtime.getCacheKey(source, translator.getCacheType()),
        translated
    );
}

it('collects save/menu expression text, stripped TODOs and status prose without evaluating code or translating assets', async () => {
    await translator.precomputeCounts();
    const texts = translator.collectUntranslated({ runtime }).map((item) => item.value);
    expect(texts).toEqual(
        expect.arrayContaining([
            '所持金：\\COT[0]G',
            '現在地：',
            '学園へ向かおう！',
            '隠し目標',
            '現在の目的',
            statusSource,
        ])
    );
    for (const excluded of [
        '画像名',
        '無関係',
        'Font',
        '[T] 学園へ向かおう！',
        '{"Text":"JSONコンテナ"}',
    ])
        expect(texts).not.toContain(excluded);
    cache('所持金：\\COT[0]G', 'Gold: \\COT[0]G');
    cache('現在地：', 'Location:');
    expect(translator.resolveText('所持金：141780G', runtime)).toBe('Gold: 141780G');
    expect(translator.resolveText('現在地：Shallow Layer: B4F', runtime)).toBe(
        'Location:Shallow Layer: B4F'
    );
    expect(translator.getCachedCountsSync({ runtime }).left).toBe(texts.length - 2);
});

it('translates private special-status sprites before variable expansion, tokenization and layout', async () => {
    class Bitmap {
        drawText(text) {
            this.lastDrawn = text;
        }
    }
    class WindowBase {
        drawText() {}
        drawTextEx() {}
    }
    class GameMessage {
        add() {}
    }
    class WindowMessage {
        startMessage() {}
    }
    class StatusSprite {
        constructor() {
            this._data = { text: statusSource };
            this.bitmap = new Bitmap();
            this.refresh();
        }
        convertedText() {
            return this._data.text.replace('\\V[9]', '42');
        }
        refresh() {
            this.layoutText = this.convertedText();
            for (const glyph of this.layoutText) this.bitmap.drawText(glyph);
        }
    }
    class StatusScene {
        createEroStatusTextOverlays() {
            this._eulidEroStatusTextOverlays = [new StatusSprite()];
            return 42;
        }
    }
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Window_Base', WindowBase);
    vi.stubGlobal('Game_Message', GameMessage);
    vi.stubGlobal('Window_Message', WindowMessage);
    vi.stubGlobal('Scene_EroStatus', StatusScene);
    await translator.precomputeCounts();
    cache(statusSource, 'Current state: \\V[9]\nA translated thought.');
    expect(translator.enablePluginTranslation()).toBe(true);
    const scene = new StatusScene();
    expect(scene.createEroStatusTextOverlays()).toBe(42);
    const sprite = scene._eulidEroStatusTextOverlays[0];
    expect(sprite.layoutText).toBe('Current state: 42\nA translated thought.');
    expect(sprite._data.text).toBe(statusSource);
    expect(sprite.convertedText()).toBe('Current state: 42\nA translated thought.');
    expect(sprite._data.text).toBe(statusSource);
    runtime.enabled = false;
    sprite.refresh();
    expect(sprite.layoutText).toBe('近況：42\n本音を表示します。');
});

it('waits for the EUL overlay method before installing any hooks', () => {
    vi.stubGlobal('Scene_EroStatus', class {});
    expect(translator.enablePluginTranslation()).toBe(false);
});
