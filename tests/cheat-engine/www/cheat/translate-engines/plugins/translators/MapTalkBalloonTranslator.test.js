import { afterEach, expect, it, vi } from 'vitest';
import { MapTalkBalloonTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MapTalkBalloonTranslator.js';
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('collects every chase alternative, multiline caption and direct command into standard messages', () => {
    const t = new MapTalkBalloonTranslator();
    t.collectCommandTexts([
        { code: 108, parameters: ['<chase sight:8>'] },
        { code: 408, parameters: ['<発見セリフ:侵入者確認…|侵入者を捕縛します…|拘束行動開始…>'] },
        { code: 408, parameters: ['<lostTalk: 見失った\\n戻ろう >'] },
        {
            code: 357,
            parameters: [
                'folder/MapTalkBalloon',
                'showBalloon',
                '',
                { text: '台詞\\n二行目', eventId: '3' },
            ],
        },
    ]);
    const r = { getCacheKey: (text, type) => type + ':' + text, hasUsableCacheValue: () => false };
    const items = t.collectUntranslated({ runtime: r });
    expect(items.map((item) => item.value)).toEqual([
        '台詞\n二行目',
        '侵入者確認…',
        '侵入者を捕縛します…',
        '拘束行動開始…',
        '見失った\n戻ろう',
    ]);
    expect(items.every((item) => item.type === 'message')).toBe(true);
});
it('translates the complete balloon before wrapping and escape expansion without touching other windows', () => {
    class BaseWindow {
        convertEscapeCharacters(text) {
            return text.replace('\\V[1]', '7');
        }
    }
    class Window_MapTalkBalloon extends BaseWindow {}
    vi.stubGlobal('window', { Window_Base: BaseWindow });
    const t = new MapTalkBalloonTranslator();
    const r = {
        isTranslationEnabled: () => true,
        getPreferredMessageCacheEntry: (text) =>
            text === '拘束\\V[1]' ? { value: 'Capture \\V[1]' } : null,
        getMessageCacheKey: (text) => 'message:' + text,
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(t, 'getRuntime').mockReturnValue(r);
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Window_MapTalkBalloon().convertEscapeCharacters('拘束\\V[1]')).toBe('Capture 7');
    expect(new BaseWindow().convertEscapeCharacters('拘束\\V[1]')).toBe('拘束7');
});
