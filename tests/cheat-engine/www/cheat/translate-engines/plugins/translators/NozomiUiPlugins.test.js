import { afterEach, expect, it, vi } from 'vitest';
vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
import { NozomiUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/NozomiUiTranslator.js';
import { FesStyleConfirmTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FesStyleConfirmTranslator.js';
import { MnkrKmsSaveWithSnapTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MnkrKmsSaveWithSnapTranslator.js';
import { CbrEroStatusTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/CbrEroStatusTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
const runtimeFor = (translator) => {
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map(),
        hasUsableCacheValue: (key) => runtime.translationCache.has(key),
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return runtime;
};

it('collects all quest fields without translating identifiers or mutating rows', async () => {
    const rows = [
        {
            dispIdx: 7,
            title: 'Quest title',
            type: 'Event',
            place: 'Town',
            text: 'First line\nSecond line',
        },
    ];
    vi.stubGlobal('window', {
        $plugins: [{ name: 'CBR_evReco', status: true }],
        CBR_evRecos: rows,
    });
    const translator = new NozomiUiTranslator();
    await translator.collectAdditionalTexts();
    expect([...translator.entries.keys()]).toEqual([
        'Quest title',
        'Event',
        'Town',
        'First line\nSecond line',
    ]);
    const runtime = runtimeFor(translator);
    runtime.translationCache.set('plugin_nozomi_ui:Quest title', 'Translated title');
    expect(translator.resolveText(rows[0].title, runtime)).toBe('Translated title');
    expect(rows[0].title).toBe('Quest title');
    expect(rows[0].dispIdx).toBe(7);
});

it('decodes nested confirmation terms and translates the whole prompt before layout', () => {
    const source = 'Load data?\nAre you sure?';
    class Confirm {
        getMessage() {
            return source;
        }
        drawText(text) {
            return text;
        }
    }
    vi.stubGlobal('window', { Window_Confirm: Confirm });
    const translator = new FesStyleConfirmTranslator();
    translator.collectParameterTexts({
        terms: JSON.stringify({ loadConfirm: JSON.stringify(source), ok: 'Yes', cancel: 'No' }),
        windowSkin: 'Window',
    });
    translator.collectCommandTexts([
        {
            code: 357,
            parameters: [
                'FesStyleConfirm',
                'showConfirm',
                '',
                { text: JSON.stringify('Event prompt'), ok: 'Continue', cancel: 'Cancel' },
            ],
        },
    ]);
    expect([...translator.entries.keys()]).toEqual([
        source,
        'Yes',
        'No',
        'Event prompt',
        'Continue',
        'Cancel',
    ]);
    const runtime = runtimeFor(translator);
    runtime.translationCache.set(
        `plugin_fes_style_confirm:${source}`,
        'Wczytac dane?\nPotwierdzasz?'
    );
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(new Confirm().getMessage()).toBe('Wczytac dane?\nPotwierdzasz?');
    runtime.isTranslationEnabled = () => false;
    expect(new Confirm().getMessage()).toBe(source);
});

it('translates save templates while preserving day, time and save objects', async () => {
    class SaveList {
        drawText(text) {
            return text;
        }
        textWidth(text) {
            return text.length;
        }
    }
    vi.stubGlobal('window', {
        Window_SavefileList: SaveList,
        $plugins: [{ name: 'MNKR_KMS_SaveWithSnapMZ', status: true, parameters: {} }],
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            text: async () =>
                'Window_SavefileList.prototype.drawItem = function() { this.drawText(`日付：${info.day}日目（${info.time}）`); };',
        }))
    );
    const translator = new MnkrKmsSaveWithSnapTranslator();
    await translator.precomputeCounts();
    const entry = [...translator.entries.values()].find((e) => e.parts);
    expect(entry.text).toBe('日付：\\COT[0]日目（\\COT[1]）');
    const runtime = runtimeFor(translator);
    runtime.translationCache.set(
        `plugin_mnkr_kms_save_with_snap:${entry.text}`,
        'Day \\COT[0] (\\COT[1])'
    );
    expect(translator.enablePluginTranslation()).toBe(true);
    const info = { day: 2, time: 'Evening' };
    expect(new SaveList().drawText(`日付：${info.day}日目（${info.time}）`)).toBe(
        'Day 2 (Evening)'
    );
    expect(info).toEqual({ day: 2, time: 'Evening' });
});

it('adds the custom history table, skips sentinels and preserves event IDs', async () => {
    const rows = [
        {
            id: 1,
            title: 'History title',
            target: 'Partner',
            place: 'Town',
            comment: 'Comment',
            virgin: true,
        },
        { title: 'CBR_null' },
    ];
    vi.stubGlobal('window', { CBR_hSceneList: rows });
    const translator = new CbrEroStatusTranslator();
    await translator.collectAdditionalTexts();
    expect([...translator.entries.keys()]).toEqual(['History title', 'Partner', 'Town', 'Comment']);
    expect(rows[0].id).toBe(1);
    expect(rows[0].virgin).toBe(true);
});
it('hooks only Nozomi UI windows and preserves original rendering when translation is disabled', () => {
    const classes = Array.from(
        { length: 5 },
        () =>
            class {
                drawText(text, ...args) {
                    return [text, ...args];
                }
                drawTextEx(text) {
                    return text;
                }
                textWidth(text) {
                    return text.length;
                }
                textSizeEx(text) {
                    return { width: text.length };
                }
            }
    );
    vi.stubGlobal('window', {
        Window_MenuStatus: classes[0],
        Window_Info: classes[1],
        Window_evList: classes[2],
        Window_EvText: classes[3],
        Window_evCategory: classes[4],
    });
    const translator = new NozomiUiTranslator();
    translator.entries.set('Quest title', { text: 'Quest title' });
    const runtime = runtimeFor(translator);
    runtime.translationCache.set('plugin_nozomi_ui:Quest title', 'Translated quest');
    vi.spyOn(translator, 'precomputeCounts').mockResolvedValue();
    expect(translator.enablePluginTranslation()).toBe(true);
    for (const Class of classes) {
        const display = new Class();
        expect(display.drawText('Quest title', 10, 20, 300)).toEqual([
            'Translated quest',
            10,
            20,
            300,
        ]);
        expect(display.textSizeEx('Quest title').width).toBe('Translated quest'.length);
    }
    expect(
        runtime.trackCacheKeyUsage.mock.calls.every(
            ([key]) => key === 'plugin_nozomi_ui:Quest title'
        )
    ).toBe(true);
    runtime.isTranslationEnabled = () => false;
    expect(new classes[3]().drawTextEx('Quest title')).toBe('Quest title');
});

it('defers Nozomi UI hooks until all required windows are available', () => {
    vi.stubGlobal('window', {});
    expect(new NozomiUiTranslator().enablePluginTranslation()).toBe(false);
});
