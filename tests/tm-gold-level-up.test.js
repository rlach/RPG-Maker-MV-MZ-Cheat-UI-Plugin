import { afterEach, expect, it, vi } from 'vitest';
import { TmGoldLevelUpTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/TmGoldLevelUpTranslator.js';

afterEach(() => vi.unstubAllGlobals());

it('collects source labels and translates private level-up windows without harvesting rendered values', async () => {
    class Base {
        drawText(text) {
            return text;
        }
    }
    class Window_GoldLevelUpCommand extends Base {}
    class Window_GoldLevelUpStatus extends Base {}
    const parameters = {
        levelUpCommand: 'レベルアップ',
        currentGold: '所持金',
        learnSkill: '覚えるスキル',
        levelUpSe: 'Up4',
        useButton: '1',
    };
    vi.stubGlobal('window', {
        Window_Base: Base,
        $plugins: [{ name: 'TMGoldLevelUp', status: true, parameters }],
    });
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            text: async () => `
            (function () {
                function Window_GoldLevelUpCommand() {}
                Window_GoldLevelUpCommand.prototype.makeCommandList = function () {
                    this.addCommand('レBellアップ', 'levelUp', this.canLevelUp());
                    this.addCommand('キャンセル', 'cancelCommand');
                };
            })();
        `,
        })
    );
    const translator = new TmGoldLevelUpTranslator();
    let enabled = true;
    const translations = new Map([
        ['レBellアップ', 'Level up'],
        ['キャンセル', 'Cancel'],
        ['レベルアップ', 'Level up'],
        ['所持金', 'Current gold'],
        ['覚えるスキル', 'Skills to learn'],
    ]);
    const runtime = {
        isTranslationEnabled: () => enabled,
        getCacheKey: (text) => text,
        trackCacheKeyUsage: vi.fn(),
        hasUsableCacheValue: (key) => translations.has(key),
        translationCache: translations,
    };
    translator.getRuntime = () => runtime;
    expect(translator.enablePluginTranslation()).toBe(true);
    await translator.scanPromise;
    expect(fetch).toHaveBeenCalledExactlyOnceWith('js/plugins/TMGoldLevelUp.js');
    expect(new Set(translator.entries.keys())).toEqual(new Set(translations.keys()));
    const command = new Window_GoldLevelUpCommand();
    const status = new Window_GoldLevelUpStatus();
    for (let redraw = 0; redraw < 3; redraw++) {
        expect(command.drawText('レBellアップ')).toBe('Level up');
        expect(command.drawText('キャンセル')).toBe('Cancel');
        expect(status.drawText('所持金')).toBe('Current gold');
        expect(status.drawText('覚えるスキル')).toBe('Skills to learn');
        expect(status.drawText(20)).toBe(20);
        expect(status.drawText('Current gold')).toBe('Current gold');
    }
    expect(runtime.trackCacheKeyUsage.mock.calls.map(([key]) => key)).toEqual(
        Array.from({ length: 3 }, () => [
            'レBellアップ',
            'キャンセル',
            '所持金',
            '覚えるスキル',
        ]).flat()
    );
    expect(translator.collectUntranslated({ runtime })).toEqual([]);
    expect(new Base().drawText('所持金')).toBe('所持金');
    expect(parameters.currentGold).toBe('所持金');
    enabled = false;
    expect(status.drawText('所持金')).toBe('所持金');
    expect(command.drawText('キャンセル')).toBe('キャンセル');
});
