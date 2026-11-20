import { afterEach, expect, it, vi } from 'vitest';
import { LLMenuScreenCustomTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/LLMenuScreenCustomTranslator.js';
import { AbilitySystemTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/AbilitySystemTranslator.js';
import { ManoInputConfigTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/ManoInputConfigTranslator.js';
import { MotMnkrEquipUiTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/MotMnkrEquipUiTranslator.js';
import { SourceTextCatalogTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/SourceTextCatalogTranslator.js';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it.each([AbilitySystemTranslator, MotMnkrEquipUiTranslator])(
    'measures translated headers before sizing their windows (%s)',
    (Translator) => {
        vi.stubGlobal('window', globalThis);
        class Base {
            textWidth(text) {
                return text.length * 10;
            }
        }
        vi.stubGlobal('Window_Base', Base);
        vi.spyOn(SourceTextCatalogTranslator.prototype, 'enablePluginTranslation').mockReturnValue(
            true
        );
        const translator = new Translator();
        translator.getRuntime = () => ({});
        translator.resolveText = (text) => (text === '並び替え' ? 'Sort equipment' : text);
        expect(translator.enablePluginTranslation()).toBe(true);
        expect(new Base().textWidth('並び替え')).toBe('Sort equipment'.length * 10);
    }
);

it('catalogs legacy menu descriptions and the ability header', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [
        {
            name: 'LL_MenuScreenCustom',
            status: true,
            parameters: {
                helpTextItem: '入手したアイテムを使用できます。',
                helpTextSkill: 'スキルを使用できます。',
            },
        },
    ]);
    expect(new LLMenuScreenCustomTranslator().buildScanEntries().map((e) => e.text)).toEqual(
        expect.arrayContaining(['入手したアイテムを使用できます。', 'スキルを使用できます。'])
    );
    const ability = new AbilitySystemTranslator();
    ability.collectParameterTexts({ HelpWindowName: 'シフトキーでセットスキル一覧' });
    expect(ability.entries.has('シフトキーでセットスキル一覧')).toBe(true);
});

it('collects equipment labels without numeric or sorting configuration', async () => {
    vi.stubGlobal('window', globalThis);
    const plugins = [
        {
            name: 'MOT_ItemFavoriteSort',
            status: true,
            parameters: {
                EquipSortHelpWindow1: 'シフトキーで最強装備',
                EquipSortHelpWindow2: 'シフトキーで並び替え',
                sortMode: '1',
            },
        },
        {
            name: 'MNKR_TMEquipStatusExMZ',
            status: true,
            parameters: { parameterHit: '命中率', parameterEva: '回避率', parameterCri: '会心率' },
        },
    ];
    vi.stubGlobal('$plugins', plugins);
    const before = JSON.stringify(plugins);
    const translator = new MotMnkrEquipUiTranslator();
    await translator.collectAdditionalTexts();
    expect([...translator.entries.keys()]).toEqual([
        'シフトキーで最強装備',
        'シフトキーで並び替え',
        '命中率',
        '回避率',
        '会心率',
    ]);
    expect(JSON.stringify(plugins)).toBe(before);
});

it('collects early MZ input labels and translates initial and subsequent help drawing', () => {
    const translator = new ManoInputConfigTranslator();
    const entries = [];
    translator.appendEntriesFromParameters(
        {
            basicOkKey: 'けってい',
            saveCommandName: '設定をほぞん',
            exitCommandHelpName: '設定を保存せずにやめる',
            resetCommand: JSON.stringify({ jp: '初期設定に戻す', en: 'reset' }),
        },
        'fixture',
        entries
    );
    expect(entries.map((e) => e.text)).toEqual(
        expect.arrayContaining([
            'けってい',
            '設定をほぞん',
            '設定を保存せずにやめる',
            '初期設定に戻す',
        ])
    );
    translator.resolveFromCache = (text) => (text === 'けってい' ? 'Confirm' : text);
    translator.getRuntime = () => ({});
    const drawn = [];
    const help = {
        drawText: (text) => drawn.push(text),
        drawTextEx: (text) => drawn.push(text),
        refresh() {
            this.drawTextEx('けってい');
        },
    };
    translator._patchSceneWindowDrawText({ _helpWindow: help });
    help.drawText('けってい');
    expect(drawn).toEqual(['Confirm', 'Confirm']);
    translator._patchSceneWindowDrawText({ _helpWindow: help });
    expect(drawn).toHaveLength(2);
});
