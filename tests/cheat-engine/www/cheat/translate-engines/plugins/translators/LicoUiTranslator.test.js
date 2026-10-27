import { it, expect, vi, afterEach } from 'vitest';
import { LicoUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LicoUiTranslator.js';
import { SourceTextCatalogTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
import { normalizeDescriptionTags } from '../../../../../../../scripts/fix-riko-description-tags.mjs';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('collects gab command payloads and state comments without technical tags', async () => {
    vi.stubGlobal('window', globalThis);
    const translator = new LicoUiTranslator();
    const command = {
        code: 357,
        parameters: [
            'SoR_GabWindow_MZ_Right2',
            'PushGab',
            '',
            { arg0: '0', arg1: 'ビリビリ…しますっ…' },
        ],
    };
    translator.collectCommandTexts([command]);
    expect(translator.entries.has('ビリビリ…しますっ…')).toBe(true);
    vi.stubGlobal('fetch', async () => ({
        ok: true,
        text: async () =>
            JSON.stringify([null, { note: '<LD><comment:Paralysis details\nRemoval: medicine>' }]),
    }));
    await translator.collectAdditionalTexts();
    expect(translator.entries.has('Paralysis details\nRemoval: medicine')).toBe(true);
    expect(translator.entries.has('LD')).toBe(false);
    expect(translator.entries.has('　\n\\ac異界の迷宮 \\LICOFLOOR[0]F')).toBe(true);
});

it('uses one floor message key while substituting the current floor at drawing', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal(
        'Game_System',
        class {
            pushGabRightMessage(text) {
                return text;
            }
        }
    );
    vi.stubGlobal(
        'Game_Message',
        class {
            add(text) {
                this.text = text;
            }
        }
    );
    vi.stubGlobal(
        'Window_Base',
        class {
            convertEscapeCharacters(text) {
                return text.replaceAll('\\', '\x1b');
            }
        }
    );
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
    const runtime = { isTranslationEnabled: () => true };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(
        true
    );
    const translator = new LicoUiTranslator();
    expect(translator.enablePluginTranslation()).toBe(true);
    const message = new Game_Message();
    message.add('　\n\\ac異界の迷宮 1F');
    const source = message.text;
    message.add('　\n\\ac異界の迷宮 42F');
    expect(message.text).toBe(source);
    expect(new Window_Base().convertEscapeCharacters(message.text)).toContain('42F');
    runtime.isTranslationEnabled = () => false;
    message.add('　\n\\ac異界の迷宮 9F');
    expect(message.text).toContain('9F');
});

it('normalizes compact display tags without changing prose, source keys or control codes', () => {
    const text =
        'Simple socks.\n【<IOutfit\nType:>Socks】【Required-Level: \\C[4]12】【rarity level:N】';
    expect(normalizeDescriptionTags(text)).toBe(
        'Simple socks.\n【<IOutfit:>Socks】【Req. Lv: \\C[4]12】【Rarity:N】'
    );
});

it('keeps standalone X display tags on one line while preserving prose breaks', () => {
    const source = 'First line\nSecond line <X(Max: 20 Tavern Mgmt:\nMenu Unlock Material)>\n<X(Req.\r\nLevel: 5)> <X(Short\nlabel)> 【<X(Nested\nlabel)>】';
    const expected = 'First line\nSecond line <X(Max: 20 Tavern Mgmt: Menu Unlock Material)>\n<X(Req. Lv: 5)> <X(Short label)> 【<X(Nested label)>】';
    expect(normalizeDescriptionTags(source)).toBe(expected);
    expect(normalizeDescriptionTags(expected)).toBe(expected);
});
