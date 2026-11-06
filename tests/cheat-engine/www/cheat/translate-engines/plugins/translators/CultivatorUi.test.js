import { SourceTextCatalogTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';
import { afterEach, expect, it, vi } from 'vitest';
import { CultivatorUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/CultivatorUiTranslator.js';
import { YknrMessageKeyWordTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/YknrMessageKeyWordTranslator.js';
import { TrpParticleOptionTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TrpParticleOptionTranslator.js';
import { PopupMessageTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/PopupMessageTranslator.js';
import { extractJavaScriptTextCatalog } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('collects custom display literals and complete season templates', async () => {
    const translator = new CultivatorUiTranslator();
    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'FTKR_ItemSubCommand',
                status: true,
                parameters: {
                    'Command Use Format': '使う',
                    'Command Discard Format': '捨てる',
                    'Command Cancel Format': 'やめる',
                },
            },
        ],
    });
    translator.extractCatalog = extractJavaScriptTextCatalog;
    await translator.collectAdditionalTexts();
    expect(translator.entries.has('春の\\COT[0]日')).toBe(true);
    const source =
        'this.drawText("効率 " + value); if (text === "年月") this.drawText("キャラ性能");';
    const catalog = translator.collectSourceCatalog(source);
    expect(catalog.entries.some((e) => e.text === '効率 \\COT[0]')).toBe(true);
    expect([...translator.entries.keys()]).toEqual(
        expect.arrayContaining(['使う', '捨てる', 'やめる'])
    );
    expect(translator.getSourcePluginNames()).toContain('YEP_SaveCore');
});

it('translates explicit keyword calls before native escape conversion without changing the table', async () => {
    class Base {
        convertEscapeCharacters(text) {
            return text.replace(/\\KW\[敵単\]/g, '\\C[2](敵単)').replace(/\\/g, '\x1b');
        }
    }
    vi.stubGlobal('window', { Window_Base: Base });
    const translator = new YknrMessageKeyWordTranslator();
    window.$plugins = [
        {
            name: 'YKNR_MessageKeyWord',
            status: true,
            parameters: {
                KeyWordList: JSON.stringify([
                    JSON.stringify({ Key: '敵単', Word: '\\C[2](敵単)' }),
                ]),
            },
        },
    ];
    let enabled = true;
    vi.spyOn(translator, 'isRuntimeTranslationActive').mockImplementation(() => enabled);
    vi.spyOn(translator, 'getRuntime').mockReturnValue({});
    vi.spyOn(translator, 'resolveRuntimeTranslation').mockReturnValue('\\C[2](One Enemy)');
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.precomputeCounts();
    expect([...translator.entries.keys()]).toEqual(['\\C[2](敵単)']);
    expect(new Base().convertEscapeCharacters('Hit \\KW[敵単]')).toBe('Hit \x1bC[2](One Enemy)');
    enabled = false;
    expect(new Base().convertEscapeCharacters('Hit \\KW[敵単]')).toBe('Hit \x1bC[2](敵単)');
});

it('scans MV particle labels using the real plugin configuration lookup', async () => {
    vi.stubGlobal('window', {
        $plugins: [
            {
                name: 'TRP_ParticleExOption',
                status: true,
                parameters: {
                    name: '演出量',
                    levels: JSON.stringify([JSON.stringify({ name: '特別', value: '100' })]),
                },
            },
        ],
    });
    const translator = new TrpParticleOptionTranslator();
    await translator.precomputeCounts();
    expect([...translator.entries.keys()]).toEqual(
        expect.arrayContaining(['最高', '特別', '演出量'])
    );
});

it('uses the original suffix-marker notification key', () => {
    const draw = vi.fn();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('CommonPopupManager', { startPopupMessage: draw });
    const translator = new PopupMessageTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue({});
    vi.spyOn(translator, 'isRuntimeTranslationActive').mockReturnValue(true);
    vi.spyOn(translator, 'resolveRuntimeTranslation').mockImplementation((text) =>
        text === '押しっぱなしで連続採取！_pum[0,280,0,0,Down]'
            ? 'Hold to keep gathering!_pum[0,280,0,0,Down]'
            : text
    );
    expect(translator.enablePluginTranslation()).toBe(true);
    CommonPopupManager.startPopupMessage([], ['押しっぱなしで連続採取！'], [0, 280, 0, 0, 'Down']);
    expect(draw.mock.calls[0][1]).toEqual(['Hold to keep gathering!']);
});

it('keeps Japanese text outside explicit keyword calls untouched', async () => {
    class Base {
        convertEscapeCharacters(text) {
            return text;
        }
    }
    vi.stubGlobal('window', {
        Window_Base: Base,
        $plugins: [
            {
                name: 'YKNR_MessageKeyWord',
                status: true,
                parameters: {
                    KeyWordList: JSON.stringify([JSON.stringify({ Key: 'day', Word: '日' })]),
                },
            },
        ],
    });
    const t = new YknrMessageKeyWordTranslator();
    vi.spyOn(t, 'getRuntime').mockReturnValue({});
    vi.spyOn(t, 'isRuntimeTranslationActive').mockReturnValue(true);
    vi.spyOn(t, 'resolveRuntimeTranslation').mockReturnValue('Day');
    t.enablePluginTranslation();
    await t.precomputeCounts();
    expect(new Base().convertEscapeCharacters('日数 春の2日')).toBe('日数 春の2日');
    expect(new Base().convertEscapeCharacters('\\KW[day]')).toBe('Day');
});
it('formats full date templates before generic fragment translation', () => {
    const t = new CultivatorUiTranslator();
    vi.spyOn(t, 'isRuntimeTranslationActive').mockReturnValue(true);
    vi.spyOn(t, 'prepareDynamicValueTag').mockImplementation(() => {});
    vi.spyOn(t, 'resolveRuntimeTranslation').mockImplementation(
        (text) =>
            ({
                '春の%1日': 'Spring, Day %1',
                '%1年目 春の%2日': 'Year %1, Spring, Day %2',
                日数: 'Date',
            })[text] || text
    );
    expect(t.resolveText('\\C[16]日数   \\C[0]春の2日', {})).toBe(
        '\\C[16]Date   \\C[0]Spring, Day 2'
    );
    expect(t.resolveText(' 1年目 春の2日', {})).toBe(' Year 1, Spring, Day 2');
});
it('reads seed categories from source notes and preserves database presentation state', () => {
    vi.stubGlobal('window', {
        DataManager: {
            itemSecondaryCategories(item) {
                return (item._secondaryCategories ||= [
                    ...item.note.matchAll(/<分類:([^>]+)>/g),
                ].map((m) => m[1]));
            },
        },
    });
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(
        true
    );
    const t = new CultivatorUiTranslator();
    expect(t.enablePluginTranslation()).toBe(true);
    const categories = ['Seed'];
    const item = {
        note: '<Type: Seed>',
        _secondaryCategories: categories,
        _translateOriginal: { note: '<分類:種>' },
    };
    expect(window.DataManager.itemSecondaryCategories(item)).toEqual(['種']);
    expect(item.note).toBe('<Type: Seed>');
    expect(item._secondaryCategories).toBe(categories);
    delete item._secondaryCategories;
    expect(window.DataManager.itemSecondaryCategories(item)).toEqual(['種']);
    expect(Object.hasOwn(item, '_secondaryCategories')).toBe(false);
});

it('translates variable-expanded choice help at the actual message display boundary', () => {
    class Message {
        convertEscapeCharacters(text) {
            return text.replace(/\\V\[1\]/g, '[肥えた]、[ふかふか]の土だ。');
        }
    }
    vi.stubGlobal('window', {
        Window_Message: Message,
        DataManager: { itemSecondaryCategories: () => [] },
    });
    vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(
        true
    );
    const t = new CultivatorUiTranslator();
    vi.spyOn(t, 'getRuntime').mockReturnValue({});
    vi.spyOn(t, 'isRuntimeTranslationActive').mockReturnValue(true);
    vi.spyOn(t, 'resolveRuntimeTranslation').mockImplementation((text) =>
        text === '[肥えた]、[ふかふか]の土だ。' ? '[Fertile], [fluffy] soil.' : text
    );
    t.enablePluginTranslation();
    expect(new Message().convertEscapeCharacters('\\V[1]')).toBe('[Fertile], [fluffy] soil.');
});
