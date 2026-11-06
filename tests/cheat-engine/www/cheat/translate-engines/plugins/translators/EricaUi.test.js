import { afterEach, expect, it, vi } from 'vitest';
import { ItemNameEscapeTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ItemNameEscapeTranslator.js';
import { EquipRemoveUiTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/EquipRemoveUiTranslator.js';
import { TrpParticleOptionTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/TrpParticleOptionTranslator.js';
import { MMUltimateTextAnimationTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/MMUltimateTextAnimationTranslator.js';
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
function runtimeFor(translator, entries) {
    const runtime = {
        enabled: true,
        isTranslationEnabled() {
            return this.enabled;
        },
        getCacheKey: (s, t) => t + ':' + s,
        translationCache: new Map(entries),
        hasUsableCacheValue(k) {
            return this.translationCache.has(k);
        },
        trackCacheKeyUsage: vi.fn(),
    };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    return runtime;
}
it('reapplies plain string escape sources without consuming variable codes or changing canonical data', () => {
    vi.stubGlobal('window', globalThis);
    let value = 5;
    vi.stubGlobal('DataManager', {
        convertName(data) {
            if (data.preDescription)
                data.description = data.preDescription.replace(/\\V\[1\]/g, String(value));
        },
    });
    const t = new ItemNameEscapeTranslator();
    const rt = runtimeFor(t, [
        ['skill_description:原文\\V[1]', 'Damage \\V[1]'],
        ['skill_name:天裂', 'Heaven Split'],
    ]);
    expect(t.enablePluginTranslation()).toBe(true);
    const data = {
        name: '天裂',
        preDescription: '原文\\V[1]',
        description: '原文5',
        _translateOriginal: { name: '天裂' },
    };
    DataManager.convertName(data);
    expect(data.description).toBe('Damage 5');
    expect(data.name).toBe('Heaven Split');
    expect(data.preDescription).toBe('原文\\V[1]');
    expect(data._translateOriginal.description).toBe('原文\\V[1]');
    value = 9;
    DataManager.convertName(data);
    expect(data.description).toBe('Damage 9');
    rt.enabled = false;
    DataManager.convertName(data);
    expect(data.description).toBe('原文9');
});
it('expands MV item escape codes again after cached field assignments and variable updates', () => {
    vi.stubGlobal('window', globalThis);
    let value = 1;
    vi.stubGlobal('DataManager', {
        convertName(data) {
            if (data.preName != null)
                data.name = data.preName
                    .replace(/\\N\[13\]/gi, 'Mina')
                    .replace(/\\V\[26\]/gi, String(value));
        },
    });
    const translator = new ItemNameEscapeTranslator();
    const source = '\\N[13]との関係\\V[26]/2';
    const translated = 'Relationship with \\N[13] \\V[26]/2';
    const runtime = runtimeFor(translator, [['item_name:' + source, translated]]);
    runtime.applyTranslatedFieldValueSafely = ({ item, field, translatedValue }) => {
        item[field] = translatedValue;
        return true;
    };
    translator.enablePluginTranslation();
    const item = { name: source, preName: source };
    DataManager.convertName(item);
    expect(item.name).toBe('Relationship with Mina 1/2');
    value = 2;
    expect(
        runtime.applyTranslatedFieldValueSafely({
            item,
            field: 'name',
            translatedValue: translated,
        })
    ).toBe(true);
    expect(item.name).toBe('Relationship with Mina 2/2');
    expect(item.preName).toBe(source);
    expect(item._translateOriginal.name).toBe(source);
    runtime.enabled = false;
    DataManager.convertName(item);
    expect(item.name).toBe('Minaとの関係2/2');
});
it('collects equipment removal text and help only', async () => {
    const t = new EquipRemoveUiTranslator();
    vi.spyOn(t, 'findPluginEntry').mockReturnValue({
        parameters: { removeText: 'はずす', removeDesc: '解除説明', commandTop: 'false' },
    });
    await t.precomputeCounts();
    expect([...t.entries.keys()]).toEqual(['はずす', '解除説明']);
});
it('translates particle level presentation without changing config levels', async () => {
    class Options {
        trpParticleNumText(value) {
            return value === 0 ? '最高' : '最低';
        }
    }
    vi.stubGlobal('window', { Window_Options: Options });
    const t = new TrpParticleOptionTranslator();
    vi.spyOn(t, 'findPluginEntry').mockReturnValue({
        status: true,
        parameters: {
            name: '演出量',
            levels: JSON.stringify([JSON.stringify({ name: 'カスタム', value: '100' })]),
        },
    });
    await t.precomputeCounts();
    expect(t.entries.has('カスタム')).toBe(true);
    const rt = runtimeFor(t, [['plugin_trp_particle_option:最高', 'Maximum']]);
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Options().trpParticleNumText(0)).toBe('Maximum');
    rt.enabled = false;
    expect(new Options().trpParticleNumText(0)).toBe('最高');
});
it('collects animated NPC messages and resolves templates before variable expansion', async () => {
    class Animated {
        convertTextVariables(text) {
            return text.replace(/\\V\[1\]/gi, '5');
        }
    }
    vi.stubGlobal('window', { MM_AnimatedText: { AnimatedText: Animated } });
    const t = new MMUltimateTextAnimationTranslator();
    t.collectCommandTexts([
        {
            code: 357,
            parameters: [
                'MM_UltimateTextAnimation',
                'ShowPresetText',
                '',
                { presetId: 'source_id', text: '女だ', x: '10' },
            ],
        },
        { code: 357, parameters: ['Other', 'ShowText', '', { text: 'ignore' }] },
    ]);
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify([
                    { presetId: 'npc', showText: JSON.stringify({ text: '別の台詞' }) },
                ]),
        })
    );
    await t.collectAdditionalTexts();
    expect([...t.entries.keys()]).toEqual(['女だ', '別の台詞']);
    const rt = runtimeFor(t, [['plugin_mm_ultimate_text_animation:値\\V[1]', 'Value \\V[1]']]);
    expect(t.enablePluginTranslation()).toBe(true);
    expect(new Animated().convertTextVariables('値\\V[1]')).toBe('Value 5');
    rt.enabled = false;
    expect(new Animated().convertTextVariables('値\\V[1]')).toBe('値5');
});
