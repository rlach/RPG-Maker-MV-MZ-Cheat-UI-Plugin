import { afterEach, expect, it, vi } from 'vitest';
import { collectScriptVariableAssignments } from '../cheat-engine/www/cheat/translate-engines/plugins/ScriptVariableAssignments.js';
import { SceneCustomMenuTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/SceneCustomMenuTranslator.js';
import { ItemBookTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/ItemBookTranslator.js';
import { EventUiTextTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/EventUiTextTranslator.js';
import { extractJavaScriptTextCatalog } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/JavaScriptTextCatalog.js';
afterEach(() => vi.unstubAllGlobals());

it('collects composed special-status text without executing scripts or scanning unrelated variables', async () => {
    const list = [
        { code: 355, parameters: ['if ($gameVariables.value(22) < 10) {'] },
        { code: 655, parameters: ["$gameVariables.setValue(121,'エロに興味のない少女');}"] },
        { code: 355, parameters: ["$gameVariables.setValue(121,'処女膜あり');"] },
        {
            code: 355,
            parameters: ["$gameVariables.setValue(122, '子宮：' + $gameVariables.value(121));"],
        },
        { code: 355, parameters: ["$gameVariables.setValue(999, 'Logic token');"] },
    ];
    const before = JSON.stringify(list);
    const translator = new SceneCustomMenuTranslator();
    translator.collectDisplayReferences('\\V[122]');
    translator.collectCommandTexts(list);
    await translator.collectAdditionalTexts();
    expect(translator.entries.has('処女膜あり')).toBe(true);
    expect(translator.entries.has('エロに興味のない少女')).toBe(true);
    expect(translator.entries.has('Logic token')).toBe(false);
    expect(collectScriptVariableAssignments(list)).toHaveLength(4);
    expect(JSON.stringify(list)).toBe(before);
});

it('collects variable-based options in SceneCustomMenu games and only ItemBook display parameters', async () => {
    vi.stubGlobal('window', {
        $plugins: [
            { name: 'SceneCustomMenu', status: true },
            {
                name: 'ItemBook',
                status: true,
                parameters: {
                    'Price Text': '価格',
                    'Equip Text': '装備',
                    'Type Text': 'タイプ',
                    command: 'doNotTranslate',
                },
            },
        ],
    });
    const ui = new EventUiTextTranslator();
    expect(ui.detectPlugin()).toBe(true);
    ui.extractCatalog = extractJavaScriptTextCatalog;
    ui.collectCommandTexts([
        { code: 102, parameters: [['\\v[179]', '\\v[180]']] },
        { code: 122, parameters: [179, 179, 0, 4, "'力強いピストン'"] },
        { code: 122, parameters: [180, 180, 0, 4, "'擦り回す'"] },
    ]);
    await ui.collectAdditionalTexts();
    expect([...ui.entries.keys()]).toEqual(expect.arrayContaining(['力強いピストン', '擦り回す']));
    const book = new ItemBookTranslator();
    await book.precomputeCounts();
    expect([...book.entries.keys()]).toEqual(['価格', '装備', 'タイプ', '??????']);
});
