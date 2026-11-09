import { afterEach, expect, it, vi } from 'vitest';
import { ArigachiImgFusionTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ArigachiImgFusionTranslator.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('resolves equipment variables only inside fusion arguments and preserves native expansion', () => {
    vi.stubGlobal('window', globalThis);
    const armor = {name: 'Dress', _translateOriginal: {name: 'ドレス'}};
    vi.stubGlobal('$dataArmors', [null, armor]);
    vi.stubGlobal('$dataWeapons', [null, {name: 'Sword', _translateOriginal: {name: '剣'}}]);
    vi.stubGlobal('$gameParty', {members: () => [{equips: () => [null, null, null, null, null, armor]}]});
    const values = {3: 'Dress', 14: 'Sword', 29: 21};
    vi.stubGlobal('$gameVariables', {value: id => values[id]});
    vi.stubGlobal('CBR', {'画像合成': images => images.map(image =>
        image.replace(/\\V\[(\d+)\]/g, (_, id) => values[id]))});
    const translator = new ArigachiImgFusionTranslator();
    const runtime = {isTranslationEnabled: () => true, getCacheKey: (source, type) => type + source,
        translationCache: new Map()};
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    expect(translator.enablePluginTranslation()).toBe(true);
    const images = ['<装備.png>', '\\V[29]/上半身_\\V[3].png', '武器_\\V[14].png'];
    expect(CBR['画像合成'](images)).toEqual(['<装備.png>', '21/上半身_ドレス.png', '武器_剣.png']);
    expect(images[1]).toBe('\\V[29]/上半身_\\V[3].png');
    expect(values[3]).toBe('Dress');
    expect(armor.name).toBe('Dress');
    runtime.isTranslationEnabled = () => false;
    expect(CBR['画像合成'](images)[1]).toBe('21/上半身_Dress.png');
});

it('handles saved previous equipment through cache and leaves unknown names alone', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$gameParty', {members: () => []});
    vi.stubGlobal('$dataWeapons', []);
    vi.stubGlobal('$dataArmors', [null, {name: 'ドレス'}]);
    const translator = new ArigachiImgFusionTranslator();
    const runtime = {getCacheKey: (source, type) => type + source,
        translationCache: new Map([['armor_nameドレス', 'Dress']])};
    expect(translator.resolveEquipmentName('Dress', 258, runtime)).toBe('ドレス');
    expect(translator.resolveEquipmentName('なし', 258, runtime)).toBe('なし');
    expect(translator.resolveEquipmentName(5, 258, runtime)).toBe(5);
});
