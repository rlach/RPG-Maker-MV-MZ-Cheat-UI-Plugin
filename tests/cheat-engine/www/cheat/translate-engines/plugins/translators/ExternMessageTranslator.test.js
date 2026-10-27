import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ExternMessageTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ExternMessageTranslator.js';

// Parser output fixture: a speaker, two message pages and a face-bearing page.
const raw = ':name[NAME]\n\u3000First\nsecond\n:page\nLast';
const compiled = [
    { code: 101, parameters: ['', 0, 0, 2, 'ヨミ'] },
    { code: 401, parameters: ['\u3000First'] },
    { code: 401, parameters: ['second'] },
    { code: 101, parameters: ['', 0, 0, 2, 'ヨミ'] },
    { code: 401, parameters: ['Last'] },
    { code: 101, parameters: ['face_file', 0, 0, 2, 'ヨミ'] },
    { code: 401, parameters: ['Portrait message'] },
    { code: 117, parameters: [123] },
];
let runtime;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [{ name: 'ExternMessage', status: true }]);
    vi.stubGlobal('$externMessage', { map: { ROOT: raw, DUP: raw }, LineMax: 4 });
    vi.stubGlobal(
        'Game_Interpreter',
        class {
            static convertMessageCommand = vi.fn((dest) => dest.push(...structuredClone(compiled)));
            command101() {
                return 12;
            }
        }
    );
    runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map(),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
});
afterEach(() => vi.unstubAllGlobals());

it('supports the 1.3 global compiler, defers display variables, and keeps technical arguments expanded', () => {
    vi.stubGlobal('parseCmd', (text) => text.replace('\\V[1]', '42'));
    vi.stubGlobal('convertMessageCommand', (item) => [
        { code: 401, parameters: [window.parseCmd(item.parameters[0], '\\V')] },
    ]);
    const translator = new ExternMessageTranslator();
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(window.convertMessageCommand({ parameters: ['Floor \\V[1]'] })[0].parameters[0]).toBe(
        'Floor \\V[1]'
    );
    expect(window.convertMessageCommand({ parameters: [':event[\\V[1]]'] })[0].parameters[0]).toBe(
        ':event[42]'
    );
    runtime.isTranslationEnabled = () => false;
    expect(window.convertMessageCommand({ parameters: ['Floor \\V[1]'] })[0].parameters[0]).toBe(
        'Floor 42'
    );
});

it('scans 1.3 references without executing immediate CSV scripts or reading current variable values', () => {
    vi.stubGlobal('parseCmd', vi.fn());
    const originalParse = window.parseCmd;
    const originalScript = () => ({ immediate: true, source: 'side effect' });
    vi.stubGlobal('convertScript', originalScript);
    vi.stubGlobal('convertMessageCommand', (item) => {
        expect(item.parameters[0]).toMatch(/^\\M\[/);
        expect(window.convertScript().immediate).toBe(false);
        expect(window.parseCmd('Floor \\V[1]', '\\V')).toBe('Floor \\V[1]');
        return [
            { code: 101, parameters: ['', 0, 0, 2, 'Speaker'] },
            { code: 401, parameters: ['Floor \\V[1]'] },
        ];
    });
    const translator = new ExternMessageTranslator();
    expect(translator.buildScanEntries().some((e) => e.text === 'Floor \\V[1]')).toBe(true);
    expect(window.convertScript).toBe(originalScript);
    expect(window.parseCmd).toBe(originalParse);
    expect(originalParse).not.toHaveBeenCalled();
});

it('scans native parser output with exact whitespace, pages and standard speaker/portrait keys', async () => {
    const translator = new ExternMessageTranslator();
    vi.spyOn(translator, 'ensureDetection').mockReturnValue(true);
    await translator.precomputeCounts();
    expect(Game_Interpreter.convertMessageCommand).toHaveBeenCalledWith(expect.any(Array), {
        code: 401,
        indent: 0,
        parameters: [raw],
    });
    const items = translator.collectUntranslated({ runtime });
    expect(items.map(({ type, value }) => [type, value])).toEqual([
        ['speaker', 'ヨミ'],
        ['message', '\u3000First\nsecond'],
        ['message', 'Last'],
        ['message_portrait', 'Portrait message'],
    ]);
    expect(translator.getCachedCountsSync({ runtime }).total).toBe(4);
    runtime.translationCache.set('speaker:ヨミ', 'Mimi');
    expect(translator.getCachedCountsSync({ runtime }).left).toBe(3);
    expect($externMessage.map.ROOT).toBe(raw);
    expect(items.some(({ value }) => value.includes(':name') || value === 'face_file')).toBe(false);
});

it('retries unavailable data and initializes the CSV dictionary through the plugin', async () => {
    const translator = new ExternMessageTranslator();
    vi.spyOn(translator, 'ensureDetection').mockReturnValue(true);
    vi.stubGlobal('$externMessage', {});
    await translator.precomputeCounts();
    expect(translator._scanPrepared).toBe(false);
    vi.stubGlobal('$externMessageCSV', 'CSV source');
    $externMessage.setup = vi.fn(() => {
        $externMessage.map = { ROOT: raw };
    });
    await translator.precomputeCounts();
    expect($externMessage.setup).toHaveBeenCalledOnce();
    expect(translator.getCachedCountsSync({ runtime }).total).toBe(4);
});

it('observes compiled original pages at command101, preserving source and disabled behavior', () => {
    const translator = new ExternMessageTranslator();
    expect(translator.enablePluginTranslation()).toBe(true);
    const interpreter = new Game_Interpreter();
    interpreter._list = [];
    interpreter._index = 0;
    Game_Interpreter.convertMessageCommand(interpreter._list, { parameters: [raw] });
    runtime.translationCache.set('message:\u3000First\nsecond', 'English page');
    expect(interpreter.command101()).toBe(12);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'message:\u3000First\nsecond',
        expect.any(Object)
    );
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith('speaker:ヨミ', expect.any(Object));
    expect(interpreter._list).toEqual(compiled);
    runtime.trackCacheKeyUsage.mockClear();
    runtime.isTranslationEnabled = () => false;
    interpreter.command101();
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
});
