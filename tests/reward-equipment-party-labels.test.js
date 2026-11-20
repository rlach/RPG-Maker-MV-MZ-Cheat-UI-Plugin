import { afterEach, expect, it, vi } from 'vitest';
import { NoEquipmentTextTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/NoEquipmentTextTranslator.js';
import { BattleSystemSelectableTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/BattleSystemSelectableTranslator.js';
import { NuunSceneFormationTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/NuunSceneFormationTranslator.js';
import { VitsunoDifficultyTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/VitsunoDifficultyTranslator.js';
import { NuunResultTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/NUUN_ResultTranslator.js';
afterEach(() => vi.unstubAllGlobals());
function runtime(cache) {
    return {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        engine: {},
        getCacheKey: (s) => s,
        translationCache: new Map(Object.entries(cache)),
        hasUsableCacheValue(key) {
            return this.translationCache.has(key);
        },
        trackCacheKeyUsage: vi.fn(),
    };
}
function setup(Translator, parameters, cache) {
    class Base {
        drawText(text, ...args) {
            return [text, ...args];
        }
    }
    class Options extends Base {
        commandSymbol() {
            return this.symbol;
        }
        statusText() {
            return this.value;
        }
        addDifficultyOptions() {}
        addCommand(text) {
            return text;
        }
    }
    vi.stubGlobal('window', { Window_Base: Base, Window_Options: Options });
    const t = new Translator();
    const rt = runtime(cache);
    t.getRuntime = () => rt;
    t.registerPluginCustomTags = vi.fn();
    t.precomputeCounts = async () => {};
    t.collectParameterTexts(parameters);
    expect(t.enablePluginTranslation()).toBe(true);
    return { t, rt, Base, Options };
}
it('translates the empty equipment entry and leaves parameters and drawing geometry intact', () => {
    const parameters = { text: '装備なし' };
    const { t, rt, Base } = setup(NoEquipmentTextTranslator, parameters, {
        装備なし: 'No equipment',
    });
    expect(t.collectUntranslated({ runtime: rt })).toEqual([]);
    expect(new Base().drawText('装備なし', 10, 20, 300)).toEqual(['No equipment', 10, 20, 300]);
    rt.enabled = false;
    expect(new Base().drawText('装備なし')[0]).toBe('装備なし');
    expect(parameters.text).toBe('装備なし');
});
it('translates both formation headings and harvests both for mass translation', () => {
    const { t, rt, Base } = setup(
        NuunSceneFormationTranslator,
        { BattleMemberName: '戦闘メンバー', MemberName: '控えメンバー', MemberName_X: '0' },
        { 戦闘メンバー: 'Battle Members' }
    );
    expect(new Base().drawText('戦闘メンバー')[0]).toBe('Battle Members');
    expect(t.collectUntranslated({ runtime: rt }).map((i) => i.value)).toEqual(['控えメンバー']);
    expect(new Base().drawText('0')[0]).toBe('0');
});
it('localizes battle-system presentation without changing the option value', () => {
    const { rt, Options } = setup(
        BattleSystemSelectableTranslator,
        { textTpbWait: 'TPBウェイト', textTpbActive: 'TPBアクティブ', textTurnBased: 'ターン制' },
        { TPBウェイト: 'TPB Wait' }
    );
    const options = new Options();
    options.symbol = 'battleSystem';
    options.value = 'TPBウェイト';
    expect(options.statusText(0)).toBe('TPB Wait');
    expect(options.value).toBe('TPBウェイト');
    options.symbol = 'other';
    expect(options.statusText(0)).toBe('TPBウェイト');
    rt.enabled = false;
    options.symbol = 'battleSystem';
    expect(options.statusText(0)).toBe('TPBウェイト');
});
it('supports the MNKR MZ difficulty alias and keeps native difficulty data untouched', () => {
    const { t, Options } = setup(
        VitsunoDifficultyTranslator,
        { 'Option Name': '難易度', '2 : Name': 'ノーマル' },
        { ノーマル: 'Normal' }
    );
    expect(t.getPluginAliases()).toContain('MNKR_Vitsuno_DifficultyMZ');
    const options = new Options();
    options.symbol = 'difficulty';
    options.value = 'ノーマル';
    expect(options.statusText(0)).toBe('Normal');
    expect(options.value).toBe('ノーマル');
});
it('translates private NUUN result sprite labels through Bitmap without altering XP numbers', () => {
    class Bitmap {
        drawText(text, ...args) {
            return [text, ...args];
        }
    }
    vi.stubGlobal('window', { Bitmap });
    const t = new NuunResultTranslator();
    const rt = runtime({ 入手経験値: 'EXP Gained', 0: 'Invalid numeric translation' });
    t.getRuntime = () => rt;
    t.buildScanEntries = () => [{ text: '入手経験値' }];
    expect(t.patchBitmapLabels()).toBe(true);
    expect(new Bitmap().drawText('入手経験値', 0, 0, 200, 36)).toEqual([
        'EXP Gained',
        0,
        0,
        200,
        36,
    ]);
    expect(new Bitmap().drawText('0')[0]).toBe('0');
    expect(new Bitmap().drawText('+46')[0]).toBe('+46');
    rt.enabled = false;
    expect(new Bitmap().drawText('入手経験値')[0]).toBe('入手経験値');
});
