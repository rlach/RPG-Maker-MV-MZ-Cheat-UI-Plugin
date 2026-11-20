import { afterEach, expect, it, vi } from 'vitest';
import { VisuOptionsCoreTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/VisuOptionsCoreTranslator.js';
import { VisuElementStatusCoreTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/VisuElementStatusCoreTranslator.js';

afterEach(() => vi.unstubAllGlobals());

async function setup(Translator, plugins, actors = []) {
    class Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            this.textSizeEx(text);
            return this.drawText(text);
        }
        textSizeEx(text) {
            return { width: this.textWidth(text) };
        }
        textWidth(text) {
            return String(text).length;
        }
    }
    class Window_Options extends Base {}
    class Window_OptionsCategory extends Base {}
    class Window_StatusData extends Base {}
    class Window_StatusCategory extends Base {}
    class Window_MenuStatus extends Base {}
    Window_StatusData.prototype.constructor = Window_MenuStatus;
    vi.stubGlobal('window', { Window_Base: Base, Window_StatusData, Window_StatusCategory });
    vi.stubGlobal(
        'fetch',
        vi.fn(async (path) => ({
            ok: true,
            text: async () => `var $plugins = ${JSON.stringify(plugins)};`,
            json: async () => {
                expect(path).toBe('data/Actors.json');
                return actors;
            },
        }))
    );
    const translator = new Translator();
    let enabled = true;
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text) => text,
        translationCache: new Map(),
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
    };
    translator.getRuntime = () => runtime;
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.scanPromise;
    return {
        translator,
        runtime,
        Base,
        Window_Options,
        Window_OptionsCategory,
        Window_StatusData,
        Window_StatusCategory,
        disable: () => {
            enabled = false;
        },
    };
}

it('collects nested option labels and draw-script values from original files, guarding nested rendering and sizes', async () => {
    const parameters = {
        'Categories:arraystruct': JSON.stringify([
            JSON.stringify({
                'Name:str': 'オーディオ',
                'List:arraystruct': JSON.stringify([
                    JSON.stringify({
                        'Symbol:str': 'masterVolume',
                        'TextStr:str': '全音量',
                        'TextJS:func': JSON.stringify("return '音量';"),
                        'DrawJS:func': JSON.stringify(
                            "this.drawText(['なし', '通常'][value]); this.drawText('Volume');"
                        ),
                        'SaveJS:func': JSON.stringify("save('保存用識別子');"),
                    }),
                ]),
            }),
        ]),
        'OptionsSettings:struct': JSON.stringify({ 'FontFaces:arraystr': '["Arial"]' }),
    };
    const { translator, runtime, Window_Options, Window_OptionsCategory, Base, disable } =
        await setup(VisuOptionsCoreTranslator, [
            { name: 'VisuMZ_1_OptionsCore', status: true, parameters },
        ]);
    expect(new Set(translator.entries.keys())).toEqual(
        new Set(['オーディオ', '全音量', '音量', 'なし', '通常', 'Volume'])
    );
    for (const key of translator.entries.keys())
        runtime.translationCache.set(key, `English ${key}`);
    runtime.translationCache.set('全音量', 'Volume');
    const options = new Window_Options();
    for (let redraw = 0; redraw < 3; redraw++) {
        expect(options.drawTextEx('\\I[4]全音量')).toBe('\\I[4]Volume');
        expect(options.textSizeEx('全音量')).toEqual({ width: 'Volume'.length });
    }
    expect(runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual(
        Array(6).fill('全音量')
    );
    expect(new Window_OptionsCategory().drawText('オーディオ')).toBe('English オーディオ');
    expect(new Base().drawText('全音量')).toBe('全音量');
    expect(options.drawText(40)).toBe(40);
    expect(translator.collectUntranslated({ runtime })).toEqual([]);
    expect(parameters['Categories:arraystruct']).toContain('全音量');
    disable();
    expect(options.drawTextEx('全音量')).toBe('全音量');
});

it('collects status vocabulary, trait displays, descriptions and biographies without trait identifiers or logic', async () => {
    const parameters = {
        'StatusMenu:struct': JSON.stringify({ 'VocabBiography:str': 'プロフィール' }),
        'StatusMenuList:arraystruct': JSON.stringify([
            JSON.stringify({
                'Symbol:str': 'parameters',
                'Text:str': '能力値',
            }),
        ]),
        'Race:struct': JSON.stringify({
            'Name:str': '内部種族名',
            'Label:str': '種族',
            'Default:struct': JSON.stringify({
                'Name:str': '内部識別子',
                'Display:str': '\\I[2]人間',
                'Description:json': JSON.stringify('説明一行目\n説明二行目'),
                'FmtText:str': '[name]',
                'Visible:eval': 'true',
            }),
        }),
    };
    const biography = '\\fs[25]名前：\\N[7]\n身長：185cm';
    const { translator, runtime, Window_StatusData, Window_StatusCategory, disable } = await setup(
        VisuElementStatusCoreTranslator,
        [
            { name: 'VisuMZ_1_ElementStatusCore', status: true, parameters },
            {
                name: 'VisuMZ_0_CoreEngine',
                status: true,
                parameters: {
                    'Param:struct': JSON.stringify({
                        'XParamVocab0:str': '命中率',
                        'IconXParam0:str': '102',
                    }),
                },
            },
        ],
        [
            null,
            {
                note: `<Trait Sets>Race: 内部識別子</Trait Sets>\n<Biography>\n${biography}\n</Biography>`,
            },
        ]
    );
    for (const key of [
        'プロフィール',
        '能力値',
        '種族',
        '\\I[2]人間',
        '説明一行目\n説明二行目',
        '命中率',
        biography,
    ])
        expect(translator.entries.has(key)).toBe(true);
    for (const key of ['内部種族名', '内部識別子', '[name]', '102', 'true'])
        expect(translator.entries.has(key)).toBe(false);
    for (const key of translator.entries.keys())
        runtime.translationCache.set(key, `English ${key}`);
    runtime.translationCache.set(biography, '\\fs[25]Name: \\N[7]\nHeight: 185cm');
    const status = new Window_StatusData();
    expect(status.constructor.name).toBe('Window_MenuStatus');
    expect(status.drawTextEx(biography)).toBe('\\fs[25]Name: \\N[7]\nHeight: 185cm');
    expect(status.drawTextEx('\\C[16]種族: \\C[0]\\I[2]人間')).toBe(
        '\\C[16]English 種族: \\C[0]English \\I[2]人間'
    );
    expect(status.drawText('命中率')).toBe('English 命中率');
    expect(new Window_StatusCategory().drawText('能力値')).toBe('English 能力値');
    const seen = runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key);
    expect(seen).toEqual([biography, '種族', '\\I[2]人間', '命中率', '能力値']);
    expect(translator.collectUntranslated({ runtime })).toEqual([]);
    expect(parameters['Race:struct']).toContain('内部識別子');
    runtime.trackCacheKeyUsage.mockClear();
    for (let redraw = 0; redraw < 3; redraw++) {
        expect(status.drawText('命中率')).toBe('English 命中率');
        expect(status.drawTextEx(biography)).toBe('\\fs[25]Name: \\N[7]\nHeight: 185cm');
    }
    await translator.buildCatalog();
    expect(runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual(
        Array.from({ length: 3 }, () => ['命中率', biography]).flat()
    );
    expect(translator.collectUntranslated({ runtime })).toEqual([]);
    disable();
    expect(status.drawTextEx(biography)).toBe(biography);
});

it('waits for status classes before installing drawing hooks', () => {
    class Base {
        drawText(text) {
            return text;
        }
        drawTextEx(text) {
            return text;
        }
    }
    vi.stubGlobal('window', { Window_Base: Base });
    const original = Base.prototype.drawText;
    expect(new VisuElementStatusCoreTranslator().enablePluginTranslation()).toBe(false);
    expect(Base.prototype.drawText).toBe(original);
});
