import { afterEach, expect, it, vi } from 'vitest';
import { SceneCustomMenuTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/SceneCustomMenuTranslator.js';
import { ShirokuronecoUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ShirokuronecoUiTranslator.js';
import { WafuFormationScreenTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/WafuFormationScreenTranslator.js';
import { LLGalgeChoiceWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/LLGalgeChoiceWindowTranslator.js';

vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function runtimeFor(translator, pairs) {
    const runtime = {
        isTranslationEnabled: () => true,
        getCacheKey: (text, type) => `${type}:${text}`,
        translationCache: new Map(
            pairs.map(([text, translated]) => [`${translator.getCacheType()}:${text}`, translated])
        ),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return runtime;
}

it('catalogs and renders evaluated menu templates while preserving executable scripts', async () => {
    const script = [
        'const total = 62;',
        'this.drawText(`開放数：${unlocked}／${total}`, 0, 0, 300);',
    ];
    const parameters = {
        Scene1: JSON.stringify({
            Id: 'Scene_Gallery',
            WindowList: JSON.stringify([
                JSON.stringify({ ItemDrawScript: JSON.stringify(script) }),
            ]),
        }),
    };
    vi.stubGlobal('window', { $plugins: [{ name: 'SceneCustomMenu', status: true, parameters }] });
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, json: async () => [] }))
    );
    const translator = new SceneCustomMenuTranslator();
    vi.spyOn(translator, '_scheduleEnablePluginTranslation').mockImplementation(() => {});
    const original = JSON.stringify(parameters);
    await translator.precomputeCounts();
    const source = '開放数：\\COT[0]／\\COT[1]';
    const runtime = runtimeFor(translator, [[source, 'Unlocked: \\COT[0] / \\COT[1]']]);
    expect(translator.collectUntranslated({ runtime })).toEqual([]);
    expect(translator.resolveText('開放数：12／62', runtime)).toBe('Unlocked: 12 / 62');
    expect(JSON.stringify(parameters)).toBe(original);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        `${translator.getCacheType()}:${source}`,
        expect.anything()
    );
});

it('catalogs nested scenario and dungeon names before their first draw', async () => {
    vi.stubGlobal('window', { $plugins: [] });
    const translator = new ShirokuronecoUiTranslator();
    translator.getSourcePluginNames = () => [];
    translator.shouldScanEventData = () => false;
    translator.collectParameterTexts({
        Scenarios: JSON.stringify([
            JSON.stringify({ ScenarioName: '忘れたい兄', BackImage: 'asset_name' }),
        ]),
        Dungeons: JSON.stringify([JSON.stringify({ DungeonName: '火山洞窟' })]),
    });
    await translator.buildCatalog();
    const runtime = runtimeFor(translator, [
        ['忘れたい兄', 'Forgotten brother'],
        ['火山洞窟', 'Volcanic Cave'],
    ]);
    expect(translator.entries.has('asset_name')).toBe(false);
    expect(translator.resolveText('忘れたい兄', runtime)).toBe('Forgotten brother');
    expect(translator.resolveText('Dungeon: 火山洞窟', runtime)).toBe('Dungeon: Volcanic Cave');
});

it('preserves fullwidth spaces and scans all conditional Galge captions and added lines', () => {
    const translator = new LLGalgeChoiceWindowTranslator();
    const first = '報酬:300,000銭　必要淫乱度:なし　本番:なし';
    const second = '報酬:600,000銭　必要淫乱度:20　本番:なし';
    const output = [];
    translator.collectShowChoiceTextsFromList(
        [
            { code: 356, parameters: [`LL_GalgeChoiceWindowMV setMessageText ${first}`] },
            { code: 411, parameters: [] },
            { code: 356, parameters: [`LL_GalgeChoiceWindowMV setMessageText ${second}`] },
            {
                code: 356,
                parameters: ['LL_GalgeChoiceWindowMV addMessageText ※クリア後まで変更できません'],
            },
        ],
        {},
        output
    );
    expect(output.map((entry) => entry.text)).toEqual([
        first,
        second,
        '※クリア後まで変更できません',
    ]);
});

it('translates Galge question source before variable escape expansion and restores the method', () => {
    class GalgeWindow {
        convertEscapeCharacters(text) {
            return text.replace('\\V[1]', '300,000');
        }
        drawText(text) {
            return text;
        }
        setQuestionText() {
            return this.drawText(this.convertEscapeCharacters('報酬:\\V[1]銭'));
        }
    }
    const translator = new LLGalgeChoiceWindowTranslator();
    const runtime = runtimeFor(translator, [['報酬:\\V[1]銭', 'Reward: \\V[1] coins']]);
    const display = new GalgeWindow();
    translator.installGalgeWindowHooks(display);
    expect(display.setQuestionText()).toBe('Reward: 300,000 coins');
    expect(Object.hasOwn(display, 'convertEscapeCharacters')).toBe(false);
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_ll_galge_choice_window:報酬:\\V[1]銭',
        expect.anything()
    );
});

it('catalogs CSV status labels and preserves numeric experience values', async () => {
    vi.stubGlobal('window', { $plugins: [] });
    const translator = new WafuFormationScreenTranslator();
    translator.getSourcePluginNames = () => [];
    translator.collectParameterTexts({ ExpLabels: '経験値,合計:,次:', StateLabels: '毒,暗,火傷' });
    await translator.buildCatalog();
    const runtime = runtimeFor(translator, [['次:\\COT[0]', 'Next: \\COT[0]']]);
    expect(translator.resolveText('次:72', runtime)).toBe('Next: 72');
    expect(translator.entries.has('毒')).toBe(true);
    expect(translator.entries.has('経験値,合計:,次:')).toBe(false);
});

it('translates assembled battle-log captions without changing numeric values or actor names', async () => {
    vi.stubGlobal('window', { $plugins: [] });
    vi.stubGlobal('fetch', vi.fn());
    const translator = new ShirokuronecoUiTranslator();
    translator.getSourcePluginNames = () => [];
    translator.shouldScanEventData = () => false;
    await translator.buildCatalog();
    const catalog = translator.collectSourceCatalog(
        "function turnLabel(turn) { return turn + '手目'; } function heal(value) { return ' HP回復' + value; }",
        'BattleLog'
    );
    for (const entry of catalog.entries) translator.entries.set(entry.text, entry);
    await translator.buildCatalog();
    const runtime = runtimeFor(translator, [
        ['手目', ' turn'],
        [' HP回復', ' HP recovered: '],
    ]);
    expect(translator.resolveText('6手目 Koyuki HP回復3', runtime)).toBe(
        '6 turn Koyuki HP recovered: 3'
    );
});
