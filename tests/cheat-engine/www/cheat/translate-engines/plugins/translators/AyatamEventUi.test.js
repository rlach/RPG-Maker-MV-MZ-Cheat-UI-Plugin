import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AyatamQuestTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/AyatamQuestTranslator.js';
import { EventUiTextTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/EventUiTextTranslator.js';
vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
let runtime;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$dataCommonEvents', []);
    vi.stubGlobal('$dataMapInfos', []);
    runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: { addPluginTags: vi.fn() },
        translationCache: new Map(),
        getCacheKey: (text, type) => `${type}:${text}`,
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.stubGlobal('__TranslationRuntime', runtime);
    vi.stubGlobal('__ensureTranslationRuntime', undefined);
});
afterEach(() => vi.unstubAllGlobals());
function instance(Class) {
    const result = new Class();
    vi.spyOn(result, 'getRuntime').mockReturnValue(runtime);
    return result;
}
function cache(translator, source, value) {
    runtime.translationCache.set(runtime.getCacheKey(source, translator.getCacheType()), value);
}

it('reads nested quest database and global labels without changing IDs or asset fields', async () => {
    const quest = {
        QuestID: 'quest1',
        QuestName: '気になる幼馴染',
        QuestContent: '説明一行目。\n説明二行目。',
        QuestClient: JSON.stringify({
            QuestClientName: '高峰 樹',
            QuestLocation: '学園2-C',
            CharacterFile: '人物画像',
        }),
    };
    const params = {
        GlobalSettings: JSON.stringify({
            QuestFlags: JSON.stringify(['メインクエスト']),
            QuestMenuHelp: '操作説明',
            QuestDataClientLabel: '対象者',
        }),
        QuestDatabase: JSON.stringify([JSON.stringify(quest)]),
    };
    vi.stubGlobal('$plugins', [
        { name: 'Ayatam_HighQualityQuestSystem', status: true, parameters: params },
    ]);
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            text: async () => 'const filename = "画像は除外"; this.drawText("受注条件");',
        }))
    );
    const translator = instance(AyatamQuestTranslator);
    await translator.precomputeCounts();
    for (const text of [
        '気になる幼馴染',
        '説明一行目。\n説明二行目。',
        '説明二行目。',
        '高峰 樹',
        '学園2-C',
        'メインクエスト',
        '操作説明',
        '対象者',
    ])
        expect(translator.entries.has(text), text).toBe(true);
    expect(translator.entries.has('quest1')).toBe(false);
    expect(translator.entries.has('人物画像')).toBe(false);
    expect(JSON.parse(params.QuestDatabase)[0]).toBe(JSON.stringify(quest));
    const count = translator.getCachedCountsSync({ runtime });
    cache(translator, '対象者', 'Client');
    expect(translator.getCachedCountsSync({ runtime }).left).toBe(count.left - 1);
    class QuestData {
        drawTextEx(text) {
            this.drawn = text;
            return text;
        }
    }
    vi.stubGlobal('Window_QuestData', QuestData);
    const parent = vi
        .spyOn(Object.getPrototypeOf(AyatamQuestTranslator.prototype), 'enablePluginTranslation')
        .mockReturnValue(true);
    try {
        expect(translator.enablePluginTranslation()).toBe(true);
        const win = new QuestData();
        win.drawTextEx('対象者');
        expect(win.drawn).toBe('Client');
        runtime.enabled = false;
        win.drawTextEx('対象者');
        expect(win.drawn).toBe('対象者');
    } finally {
        parent.mockRestore();
    }
});

async function prepareUi() {
    vi.stubGlobal('$plugins', [{ name: 'TMSimpleWindow', status: true, parameters: {} }]);
    const list = [
        { code: 356, parameters: ['D_TEXT \\V[800] 24'] },
        { code: 356, parameters: ['D_TEXT 今日の★：\\V[801] 24'] },
        { code: 356, parameters: ['showWindow 1 0 0 400 200 名前：\\V[810]\\n要求：\\V[812]'] },
        { code: 122, parameters: [800, 800, 0, 4, "'今日の★：' + $gameVariables.value(801)"] },
        { code: 122, parameters: [810, 810, 0, 1, 811] },
        { code: 122, parameters: [811, 811, 0, 4, "'天真爛漫'"] },
        { code: 122, parameters: [812, 812, 0, 4, "'\\\\V[813]'"] },
        { code: 122, parameters: [813, 813, 0, 4, "'青字特徴'"] },
        { code: 122, parameters: [999, 999, 0, 4, "'無関係なファイル'"] },
    ];
    vi.stubGlobal('$dataCommonEvents', [{ list }]);
    const translator = instance(EventUiTextTranslator);
    await translator.precomputeCounts();
    return translator;
}

it('follows display-variable assignments and aliases without evaluating expressions or scanning unrelated variables', async () => {
    const translator = await prepareUi();
    for (const text of ['今日の★：\\COT[0]', '天真爛漫', '青字特徴', '今日の★：\\V[801]'])
        expect(translator.entries.has(text), text).toBe(true);
    expect(translator.entries.has('無関係なファイル')).toBe(false);
    expect(translator.displayVariables.has(811)).toBe(true);
    expect(translator.displayVariables.has(813)).toBe(true);
});

it('translates raw report templates and expanded business strings only inside display windows, preserving game state and ESC codes', async () => {
    const translator = await prepareUi();
    const values = { 800: '今日の★：7', 801: 7, 810: '天真爛漫', 812: '\\V[813]', 813: '青字特徴' };
    const originalValues = JSON.stringify(values);
    vi.stubGlobal('$gameVariables', { value: (id) => values[id] ?? 0 });
    class Base {
        convertEscapeCharacters(text) {
            for (let i = 0; i < 2; i++)
                text = text.replace(/\\V\[(\d+)\]/gi, (_, id) => values[id] ?? 0);
            return text.replace(/\\C\[/g, '\x1bC[');
        }
    }
    class Window_Simple extends Base {}
    vi.stubGlobal('Window_Base', Base);
    const hidden = new Base();
    vi.stubGlobal('SceneManager', { _hiddenWindow: hidden });
    cache(translator, '今日の★：\\COT[0]', 'Today: \\COT[0]');
    cache(translator, '今日の★：\\V[801]', 'Earned: \\V[801]');
    cache(translator, '天真爛漫', 'Innocent');
    cache(translator, '青字特徴', 'Blue trait');
    const parent = vi
        .spyOn(Object.getPrototypeOf(EventUiTextTranslator.prototype), 'enablePluginTranslation')
        .mockReturnValue(true);
    try {
        expect(translator.enablePluginTranslation()).toBe(true);
        expect(hidden.convertEscapeCharacters('\\V[800]')).toBe('Today: 7');
        expect(hidden.convertEscapeCharacters('今日の★：\\V[801]')).toBe('Earned: 7');
        const win = new Window_Simple();
        expect(win.convertEscapeCharacters('\\C[25]\\V[810]')).toBe('\x1bC[25]Innocent');
        expect(win.convertEscapeCharacters('\\V[812]')).toBe('Blue trait');
        expect(new Base().convertEscapeCharacters('\\V[810]')).toBe('天真爛漫');
        expect(JSON.stringify(values)).toBe(originalValues);
        expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
            'plugin_event_ui_text:今日の★：\\COT[0]',
            expect.any(Object)
        );
        runtime.enabled = false;
        expect(hidden.convertEscapeCharacters('\\V[800]')).toBe('今日の★：7');
    } finally {
        parent.mockRestore();
    }
});
