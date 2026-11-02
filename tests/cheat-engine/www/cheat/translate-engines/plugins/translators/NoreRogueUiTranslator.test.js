import { afterEach, expect, it, vi } from 'vitest';
import { NoreRogueUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NoreRogueUiTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function fixture() {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'Nore_RogueMenu', status: true, parameters: {} },
        { name: 'VocabQuest', status: true, parameters: {} },
        { name: 'Nore_Medal', status: false, parameters: {} },
    ]);
    const source = `
        TextManager.alias = '二つ名';
        var QUEST_MAP = { 1: { desc1: 'ゴブリンを討伐してください。' } };
        function draw() {
            this.drawText('受注中のクエスト', 0, 0);
            this.drawText('特殊能力なし', 0, 0);
            this.drawTextEx('%1を装備した！'.format(item.name), 0, 0);
            this.drawTextEx('宝箱獲得によって ' + exp + 'EXP を獲得した！', 0, 0);
            this.drawTextEx(skill.name + 'を選択しますか？', 0, 0);
            ImageManager.loadPicture('未閲覧画像');
        }
    `;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => ({
            ok: true,
            text: async () =>
                url.startsWith('js/')
                    ? source
                    : JSON.stringify([
                          null,
                          {
                              id: 1,
                              note: '<hint:闇のLVがLV10になった><desc1:敵の特殊説明><rank:3><hidden:true>',
                          },
                      ]),
        }))
    );
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class BaseWindow {
        constructor() {
            this.contents = new Bitmap();
        }
        drawText(text) {
            return this.contents.drawText(text);
        }
        drawTextEx(text) {
            return this.contents.drawText(text);
        }
    }
    class Message {
        add(text) {
            this._texts.push(text);
        }
        faceName() {
            return '';
        }
    }
    class MessageWindow extends BaseWindow {
        startMessage() {
            return window.$gameMessage._texts.join('\n');
        }
    }
    class Bubble extends MessageWindow {
        startMessage() {
            return window.$gameMessage._texts.join('\n');
        }
    }
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Window_Base', BaseWindow);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    vi.stubGlobal('Window_Message2', undefined);
    vi.stubGlobal('Window_Fukidashi', Bubble);
    vi.stubGlobal('$gameMessage', { _texts: [] });
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text}`,
        getMessageCacheKey: (text) => `message:${text}`,
        getPreferredMessageCacheEntry(text) {
            const value = this.translationCache.get(`message:${text}`);
            return value ? { value } : null;
        },
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
        setCacheValue: vi.fn(),
    };
    const translator = new NoreRogueUiTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return { translator, runtime, BaseWindow, Bubble };
}

it('catalogs vocabulary, UI templates and visible metadata, excluding assets and unlock fields', async () => {
    const { translator, runtime } = fixture();
    await translator.precomputeCounts();
    const values = translator.collectUntranslated({ runtime }).map((item) => item.value);
    expect(values).toContain('二つ名');
    expect(values).toContain('受注中のクエスト');
    expect(values).toContain('ゴブリンを討伐してください。');
    expect(values).toContain('闇のLVがLV10になった');
    expect(values).toContain('敵の特殊説明');
    expect(values).toContain('\\COT[0]を装備した！');
    expect(values).not.toContain('未閲覧画像');
    expect(values).not.toContain('hidden');
    expect(fetch.mock.calls.some(([url]) => url.includes('Nore_Medal'))).toBe(false);
});

it('translates dynamic equipment, EXP and skill prompts without rewriting source data', async () => {
    const { translator, runtime, BaseWindow } = fixture();
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();
    for (const [source, target] of [
        ['\\COT[0]を装備した！', 'Equipped \\COT[0]!'],
        ['宝箱獲得によって \\COT[0]EXP を獲得した！', 'Gained \\COT[0] EXP from the chest!'],
        ['\\COT[0]を選択しますか？', 'Select \\COT[0]?'],
    ])
        runtime.translationCache.set(`plugin_nore_rogue_ui:${source}`, target);
    const view = new BaseWindow();
    expect(view.drawTextEx('Short Swordを装備した！')).toBe('Equipped Short Sword!');
    expect(view.drawTextEx('宝箱獲得によって 4EXP を獲得した！')).toBe(
        'Gained 4 EXP from the chest!'
    );
    expect(view.drawTextEx('Darkness Slashを選択しますか？')).toBe('Select Darkness Slash?');
    runtime.enabled = false;
    expect(view.drawTextEx('Short Swordを装備した！')).toBe('Short Swordを装備した！');
});

it('resolves every successive bubble from message cache despite a stale applied flag, preserving source buffers', async () => {
    const { translator, runtime, Bubble } = fixture();
    translator.enablePluginTranslation();
    await translator.precomputeCounts();
    const bubble = new Bubble();
    bubble._translationApplied = true;
    for (const [source, target] of [
        ['最初のセリフ', 'First line'],
        ['嘘でしょ……こんな屈辱……', 'No way... Such humiliation...'],
    ]) {
        runtime.translationCache.set(`message:${source}`, target);
        const texts = [source];
        window.$gameMessage._texts = texts;
        expect(bubble.startMessage()).toBe(target);
        expect(window.$gameMessage._texts).toBe(texts);
    }
    runtime.enabled = false;
    expect(bubble.startMessage()).toBe('嘘でしょ……こんな屈辱……');
    runtime.enabled = true;
    window.$gameMessage._translateOriginalText = '最初のセリフ';
    window.$gameMessage._texts = ['First line'];
    runtime.trackCacheKeyUsage.mockClear();
    expect(bubble.startMessage()).toBe('First line');
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
    window.$gameMessage._texts = ['未知のセリフ'];
    expect(bubble.startMessage()).toBe('未知のセリフ');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith('message:未知のセリフ');
    expect(runtime.trackCacheKeyUsage.mock.calls.some(([key]) => key.includes('First line'))).toBe(
        false
    );
});
