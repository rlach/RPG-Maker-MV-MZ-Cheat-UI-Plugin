import { afterEach, expect, it, vi } from 'vitest';
import { Rj01477834Translator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/Rj01477834Translator.js';

afterEach(() => vi.unstubAllGlobals());

it('extracts only info captions using the game parser normalization', () => {
    const t = new Rj01477834Translator();
    t.collectCommandTexts([
        { code: 108, parameters: ['info:魔王城ボス,40 infoMove:50,-20'] },
        { code: 408, parameters: ['info：催眠ダンジョン敵グループ　info:Boss\\V[1],21'] },
        { code: 401, parameters: ['info:ignored'] },
    ]);
    expect([...t.entries.keys()]).toEqual(['魔王城ボス', '催眠ダンジョン敵グループ', 'boss\\v[1]']);
});

it('resolves source captions before variable expansion and label sizing', () => {
    const convert = vi.fn((text) => text.replace(/\\v\[1\]/gi, '7'));
    vi.stubGlobal('window', { _PD_EventInfomation: { convertEscapeCharacters: convert } });
    const t = new Rj01477834Translator();
    vi.spyOn(t, 'getRuntime').mockReturnValue({});
    const resolve = vi.spyOn(t, 'resolveRuntimeTranslation').mockReturnValue('Boss \\v[1]');
    expect(t.enablePluginTranslation()).toBe(true);
    expect(window._PD_EventInfomation.convertEscapeCharacters('魔王城ボス')).toBe('Boss 7');
    expect(resolve.mock.calls[0][0]).toBe('魔王城ボス');
    expect(convert).toHaveBeenCalledWith('Boss \\v[1]');
});
