import { afterEach, expect, it, vi } from 'vitest';
import { DTextPictureTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DTextPictureTranslator.js';
import { DestinationWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DestinationWindowTranslator.js';
vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
it('scans folder-prefixed destination and DText commands without changing their syntax', () => {
    const destination = new DestinationWindowTranslator();
    const command = {
        code: 357,
        parameters: [
            'toriakontan/DestinationWindow',
            'SET_DESTINATION',
            '目標設定',
            { destination: '村を探索してみよう', icon: '' },
        ],
    };
    expect(destination.extractDestinationEntry(command).text).toBe('村を探索してみよう');
    const dtext = new DTextPictureTranslator();
    expect(
        dtext.extractDTextEntry({
            code: 357,
            parameters: ['toriakontan/DTextPicture', 'dText', '', { text: '日数：\\V[62]' }],
        }).text
    ).toBe('日数：\\V[62]');
    expect(command.parameters[0]).toBe('toriakontan/DestinationWindow');
});
it('translates a restored real-time picture before variable expansion and preserves its saved source', () => {
    const source = '\\C[23]日数\\C[0]：\\V[62]　\\C[27]経験値\\C[0]：\\V[2]';
    const translated = '\\C[23]Days\\C[0]:\\V[62]　\\C[27]EXP\\C[0]:\\V[2]';
    let day = 8;
    class Picture {
        updateDText() {
            this._dTextValue = this.dTextInfo.value
                .replace('\\V[62]', String(day))
                .replace('\\V[2]', '42');
        }
    }
    vi.stubGlobal('window', { Game_Picture: Picture });
    const translator = new DTextPictureTranslator();
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map([['plugin_dtext:' + source, translated]]),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    translator.installMZRefreshHook();
    const picture = new Picture();
    picture.dTextInfo = JSON.parse(JSON.stringify({ value: source, realTime: true }));
    picture.updateDText();
    expect(picture._dTextValue).toBe(translated.replace('\\V[62]', '8').replace('\\V[2]', '42'));
    day = 9;
    picture.updateDText();
    expect(picture._dTextValue).toContain('Days\\C[0]:9');
    expect(picture.dTextInfo.value).toBe(source);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_dtext:' + source,
        expect.anything()
    );
    runtime.enabled = false;
    picture.updateDText();
    expect(picture._dTextValue).toContain('日数');
    expect(picture.dTextInfo.value).toBe(source);
});
