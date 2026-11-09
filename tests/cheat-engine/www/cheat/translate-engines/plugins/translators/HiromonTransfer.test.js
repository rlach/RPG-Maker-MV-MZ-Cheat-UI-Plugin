import { afterEach, expect, it, vi } from 'vitest';
import { HiromonTransferTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/HiromonTransferTranslator.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('detects Hiromon before database loading', () => {
    vi.stubGlobal('window', {document: {title: 'ヒロモンSLG　Ver1.5'}});
    expect(new HiromonTransferTranslator().detectPlugin()).toBe(true);
    window.document.title = 'Another game';
    expect(new HiromonTransferTranslator().detectPlugin()).toBe(false);
});

it('restores destination branches using the command320 spelling without mutating game data', () => {
    vi.stubGlobal('window', globalThis);
    let name = 'Town';
    vi.stubGlobal('$gameActors', {actor: () => ({name: () => name})});
    class Interpreter {
        command111() { this.result = name === this._params[3]; return true; }
    }
    vi.stubGlobal('Game_Interpreter', Interpreter);
    const translator = new HiromonTransferTranslator();
    const runtime = {isTranslationEnabled: () => true, getCacheKey: text => text,
        hasUsableCacheValue: text => text === '町', translationCache: new Map([['町', 'town']]),
        normalizeSpeakerNameCase: text => text[0].toUpperCase() + text.slice(1)};
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const interpreter = new Interpreter();
    const params = [4, 26, 1, '町'];
    interpreter._params = params;
    expect(interpreter.command111()).toBe(true);
    expect(interpreter.result).toBe(true);
    expect(interpreter._params).toBe(params);
    expect(name).toBe('Town');
    name = 'House';
    interpreter.command111();
    expect(interpreter.result).toBe(false);
    name = '町';
    interpreter.command111();
    expect(interpreter.result).toBe(true);
    name = 'Town';
    interpreter._params = [4, 27, 1, '町'];
    interpreter.command111();
    expect(interpreter.result).toBe(false);
    interpreter._params = params;
    runtime.isTranslationEnabled = () => false;
    interpreter.command111();
    expect(interpreter.result).toBe(false);
});
