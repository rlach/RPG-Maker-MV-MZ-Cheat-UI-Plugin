import { afterEach, expect, it, vi } from 'vitest';
import { NoreClickerUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NoreClickerUiTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('catalogs clicker vocabulary, descriptions and whole bubbles and preserves source state', async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        { name: 'Nore_ClickerMain', status: true, parameters: {} },
        { name: 'Nore_ClickerDialogueParam', status: true, parameters: {} },
        { name: 'Vocab', status: true, parameters: {} },
        { name: 'Vocab_en', status: false, parameters: {} },
    ]);
    const source = `TextManager.other = 'その他';
        TextManager.total = '今までに稼いだＧ';
        TextManager.stat = '感度:';
        var DIALOGUES = { '1': '一行目\\n二行目' };
        var UPGRADES = { desc: 'クリックを強化する' };
        ImageManager.loadPicture('画像のみ');`;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => ({
            ok: true,
            text: async () => (url.startsWith('js/') ? source : '[]'),
        }))
    );
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class BaseWindow {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
    }
    class Message {
        add() {}
    }
    class MessageWindow {
        startMessage() {}
    }
    class Dialogue {
        texts() {
            return ['一行目', '二行目'];
        }
    }
    vi.stubGlobal('Bitmap', Bitmap);
    vi.stubGlobal('Window_Base', BaseWindow);
    vi.stubGlobal('Game_Message', Message);
    vi.stubGlobal('Window_Message', MessageWindow);
    vi.stubGlobal('ClickerDialogue', Dialogue);
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue(key) {
            return !!this.translationCache.get(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    const translator = new NoreClickerUiTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();
    const values = translator.collectUntranslated({ runtime }).map((entry) => entry.value);
    expect(values).toEqual(
        expect.arrayContaining([
            'その他',
            '今までに稼いだＧ',
            '感度:',
            '一行目\n二行目',
            'クリックを強化する',
        ])
    );
    expect(values).not.toContain('画像のみ');
    runtime.translationCache.set(
        'plugin_nore_clicker_ui:一行目\n二行目',
        'First line\nSecond line'
    );
    const dialogue = new Dialogue();
    expect(dialogue.texts()).toEqual(['First line', 'Second line']);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_nore_clicker_ui:一行目\n二行目',
        expect.anything()
    );
    expect(dialogue.texts()).toEqual(['First line', 'Second line']);
    runtime.enabled = false;
    expect(dialogue.texts()).toEqual(['一行目', '二行目']);
});
