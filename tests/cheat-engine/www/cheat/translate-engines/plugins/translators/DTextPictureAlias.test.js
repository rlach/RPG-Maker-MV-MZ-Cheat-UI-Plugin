import { afterEach, expect, it, vi } from 'vitest';
import { DTextPictureTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DTextPictureTranslator.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('detects the renamed Fallen Noble plugin and extracts its status text', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [{name: '動的文字列ピクチャ生成プラグイン', status: true}]);
    const translator = new DTextPictureTranslator();
    expect(translator.detectPlugin()).toBe(true);
    expect(translator.extractDTextEntry({code: 356,
        parameters: ['D_TEXT リシアのステータス 32']} ).text).toBe('リシアのステータス');
});

it('translates the renamed plugin payload before native variable expansion', () => {
    vi.stubGlobal('window', globalThis);
    class Screen {setDTextPicture(value, size) { return [value, size]; }}
    vi.stubGlobal('Game_Screen', Screen);
    const translator = new DTextPictureTranslator();
    const source = '　最大ＨＰ　： \\v[42]';
    const runtime = {isTranslationEnabled: () => true, getCacheKey: text => text,
        hasUsableCacheValue: text => text === source,
        translationCache: new Map([[source, ' Max HP: \\v[42]']]), trackCacheKeyUsage: vi.fn()};
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    translator.installLegacySetDTextPictureHook();
    expect(new Screen().setDTextPicture(source, 24)).toEqual([' Max HP: \\v[42]', 24]);
});
