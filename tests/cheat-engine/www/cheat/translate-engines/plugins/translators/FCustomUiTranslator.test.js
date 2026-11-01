import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { FCustomUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FCustomUiTranslator.js';
import { EquipAndShopStatusRTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/EquipAndShopStatusRTranslator.js';
import { loadMapDataById } from '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js';

vi.mock(
    '../../../../../../../cheat-engine/www/cheat/js/translation-runtime/ObjectTranslationModalMethods.js',
    () => ({ loadMapDataById: vi.fn() })
);

const structs = (items) => JSON.stringify(items.map((item) => JSON.stringify(item)));
let runtime;
let translator;
beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$dataMapInfos', [null, { id: 1, name: 'Internal map' }]);
    vi.stubGlobal('$dataCommonEvents', []);
    vi.mocked(loadMapDataById).mockResolvedValue({ displayName: 'グランテール旧市街', events: [] });
    vi.stubGlobal('$plugins', [
        {
            name: 'CustomMadeMenu',
            status: true,
            parameters: {
                InfoLabels: JSON.stringify({
                    map: '現在地',
                    time: 'プレイ時間',
                    desc: '説明',
                    dish: '料理',
                }),
                DishNames: JSON.stringify(['チョココロネ']),
            },
        },
        {
            name: 'CustomMenuCommands',
            status: true,
            parameters: {
                Commands: structs([
                    {
                        type: 'skill',
                        symbol: 'unchanged',
                        description: JSON.stringify('スキル、アビリティを開きます'),
                    },
                ]),
            },
        },
        {
            name: 'CustomMadeSkill',
            status: true,
            parameters: { SkillLabel: 'スキル', AbilityLabel: 'アビリティ', SlotLabel: 'スロット' },
        },
        {
            name: 'CustomMadeStatus',
            status: true,
            parameters: { AtkLabels: JSON.stringify(['メイン', 'サブ']) },
        },
        {
            name: 'AssetDatabase_Gallery',
            status: true,
            parameters: {
                MovieList: structs([
                    {
                        id: 'Sonoyu_ED',
                        title: 'ＥＤ/枯れない花',
                        thumbnail: '日本語画像',
                        unlocker: '35',
                    },
                ]),
                SkitList: structs([
                    { id: 'Skit004', title: '004「普通が一番」', inputSwitches: '[]' },
                ]),
            },
        },
        {
            name: 'SecondStatusScene',
            status: true,
            parameters: {
                CommonTexts: JSON.stringify({
                    levelLabel: 'Ｈレベル',
                    statusALabels: JSON.stringify(['セクハラ']),
                    statusATemplate: '{value}回',
                    bonusTemplates: JSON.stringify({
                        abilitySlot: 'アビリティスロット[ +{amount}]',
                    }),
                }),
                BonusList: JSON.stringify({
                    variable: structs([{ id: '10', display: '戦歴ポイント+1000' }]),
                }),
                ActorList: structs([
                    {
                        name: 'Actor identity',
                        backgrounds: structs([{ name: '背景画像' }]),
                        quotes: structs([{ text: '変な感じ…。', value: '3' }]),
                    },
                ]),
            },
        },
    ]);
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, text: async () => '"use strict";' }))
    );
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
    translator = new FCustomUiTranslator();
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
const cache = (source, value, owner = translator) =>
    runtime.translationCache.set(runtime.getCacheKey(source, owner.getCacheType()), value);

it('scans every display surface before observation, excluding assets and identity/unlock data', async () => {
    const before = JSON.stringify(window.$plugins);
    await translator.precomputeCounts();
    const values = translator.collectUntranslated({ runtime }).map((entry) => entry.value);
    expect(values).toEqual(
        expect.arrayContaining([
            '現在地',
            '料理',
            'チョココロネ',
            'スキル、アビリティを開きます',
            'スキル',
            'アビリティ',
            'スロット\\COT[0]',
            'メイン',
            'サブ',
            'ＥＤ/枯れない花',
            '004「普通が一番」',
            'Ｈレベル',
            'セクハラ',
            '変な感じ…。',
            '戦歴ポイント+1000',
            'グランテール旧市街',
        ])
    );
    for (const excluded of [
        'Sonoyu_ED',
        'Skit004',
        '日本語画像',
        '背景画像',
        'Actor identity',
        'unchanged',
        '35',
        '{value}回',
    ])
        expect(values).not.toContain(excluded);
    expect(JSON.stringify(window.$plugins)).toBe(before);
    expect(new Set(values).size).toBe(values.length);
    cache('メイン', 'Main');
    expect(translator.getCachedCountsSync({ runtime }).left).toBe(values.length - 1);
    expect(translator.getCachedCountsSync({ runtime }).total).toBe(values.length);
});

it('matches dynamic slot numbers and optional reward templates without per-number cache keys', async () => {
    await translator.precomputeCounts();
    cache('スロット\\COT[0]', 'Slot \\COT[0]');
    cache('\\COT[0]回', '\\COT[0] times');
    cache('アビリティスロット +\\COT[0]', 'Ability slot +\\COT[0]');
    cache('アビリティスロット', 'Ability slot');
    for (const number of ['1', '12', '99']) {
        expect(translator.resolveText('スロット' + number, runtime)).toBe('Slot ' + number);
        expect(translator.resolveText(number + '回', runtime)).toBe(number + ' times');
    }
    expect(translator.resolveText('アビリティスロット +3', runtime)).toBe('Ability slot +3');
    expect(translator.resolveText('アビリティスロット', runtime)).toBe('Ability slot');
    expect(runtime.trackCacheKeyUsage.mock.calls.flat().join(' ')).not.toContain('スロット99');
});

it('translates drawn gallery titles and old save locations, tracks original keys and respects OFF', async () => {
    await translator.precomputeCounts();
    class Bitmap {
        drawText(text) {
            return text;
        }
    }
    class WindowBase {
        drawText(text) {
            return new Bitmap().drawText(text);
        }
    }
    translator.hookDrawing(WindowBase.prototype, 'drawText');
    translator.hookDrawing(Bitmap.prototype, 'drawText');
    cache('ＥＤ/枯れない花', 'Ending / Flower');
    cache('グランテール旧市街', 'Old Town');
    cache('メイン', 'サブ');
    cache('サブ', 'Sub');
    expect(new Bitmap().drawText('ＥＤ/枯れない花')).toBe('Ending / Flower');
    const info = { mapname: 'グランテール旧市街' };
    expect(new WindowBase().drawText(info.mapname)).toBe('Old Town');
    expect(info.mapname).toBe('グランテール旧市街');
    expect(new WindowBase().drawText('メイン')).toBe('サブ');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(
        'plugin_f_custom_ui:ＥＤ/枯れない花',
        expect.anything()
    );
    expect(translator.resolveText('Translated text / スキル', runtime)).toBe(
        'Translated text / スキル'
    );
    runtime.enabled = false;
    expect(new Bitmap().drawText('ＥＤ/枯れない花')).toBe('ＥＤ/枯れない花');
});

it('translates shop vocabulary that bypasses drawEffectText without modifying expressions', () => {
    class EquipStatus {
        drawText(text) {
            return text;
        }
        drawExParams(text, expression) {
            return [this.drawText(text), expression];
        }
    }
    class ShopStatus extends EquipStatus {
        drawEffectText(text, value) {
            return [this.drawText(text), this.drawText(value)];
        }
        drawMetaTag(text) {
            return [this.drawText(text), this._item.meta[text]];
        }
    }
    vi.stubGlobal('Window_EquipStatus', EquipStatus);
    // The real plugin keeps this class inside an IIFE, not on window.
    vi.stubGlobal('Window_RefineShopStatus', undefined);
    vi.stubGlobal('$plugins', [
        {
            name: 'EquipAndShopStatusR',
            status: true,
            parameters: {
                'Sparam Names': '狙われ率',
                'Equip Type Text': '装備タイプ',
                'Armor Type Text': '防具タイプ',
                'Price Text': '価値',
                Page1: 'ex<16:攻撃Ａ:a.wslot(1).atk>',
                'Shop Info': 'meta[説明]',
            },
        },
    ]);
    const shopTranslator = new EquipAndShopStatusRTranslator();
    vi.spyOn(shopTranslator, 'getRuntime').mockReturnValue(runtime);
    cache('狙われ率', 'Target rate', shopTranslator);
    cache('装備タイプ', 'Equip type', shopTranslator);
    cache('攻撃Ａ', 'Attack A', shopTranslator);
    cache('説明', 'Description', shopTranslator);
    expect(shopTranslator.enablePluginTranslation()).toBe(true);
    const installedDraw = EquipStatus.prototype.drawText;
    expect(shopTranslator.enablePluginTranslation()).toBe(true);
    expect(EquipStatus.prototype.drawText).toBe(installedDraw);
    expect(new EquipStatus().drawText('狙われ率')).toBe('Target rate');
    expect(new ShopStatus().drawEffectText('装備タイプ', 'Body')).toEqual(['Equip type', 'Body']);
    expect(new EquipStatus().drawExParams('攻撃Ａ', 'a.wslot(1).atk')).toEqual([
        'Attack A',
        'a.wslot(1).atk',
    ]);
    expect(new ShopStatus().drawText('Already translated')).toBe('Already translated');
    const shop = new ShopStatus();
    shop._item = { meta: { 説明: 'Original metadata value' } };
    expect(shop.drawMetaTag('説明')).toEqual(['Description', 'Original metadata value']);
    expect(Object.hasOwn(ShopStatus.prototype, 'drawText')).toBe(false);
    runtime.trackCacheKeyUsage.mockClear();
    cache('狙われ率', '装備タイプ', shopTranslator);
    expect(shop.drawText('狙われ率')).toBe('装備タイプ');
    expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(1);
    runtime.enabled = false;
    runtime.trackCacheKeyUsage.mockClear();
    expect(new EquipStatus().drawText('狙われ率')).toBe('狙われ率');
    expect(runtime.trackCacheKeyUsage).not.toHaveBeenCalled();
});
