import { afterEach, expect, it, vi } from 'vitest';
import { BBCustomSaveWindowTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/BBCustomSaveWindowTranslator.js';
import { FtkrSkillTreeSystemTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/FtkrSkillTreeSystemTranslator.js';
import { ItemCombinationMZTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/ItemCombinationMZTranslator.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('initializes BB save map translation even when all configurable labels are empty', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [{ name: 'BB_CustomSaveWindow', status: true, parameters: { Item1title: ' ', ItemValue1unit: '' } }]);
    class SaveWindow { drawContents() {} drawText(text) { return text; } }
    vi.stubGlobal('Window_SavefileList', SaveWindow);
    expect(new BBCustomSaveWindowTranslator().enablePluginTranslation()).toBe(true);
});

it('does not activate FTKR when its required tree database is unconfigured', () => {
    vi.stubGlobal('window', globalThis);
    const plugin = { name: 'FTKR_SkillTreeSystem', status: true, parameters: { 'Skill Tree Id': '' } };
    vi.stubGlobal('$plugins', [plugin]);
    expect(new FtkrSkillTreeSystemTranslator().detectPlugin()).toBe(false);
    plugin.parameters['Skill Tree Id'] = '1';
    expect(new FtkrSkillTreeSystemTranslator().detectPlugin()).toBe(true);
});

it('translates private crafting scenes without requiring a public scene constructor', () => {
    vi.stubGlobal('window', globalThis);
    class Party { ingredients() {} canCombine() {} }
    class BaseWindow { drawText(text) { return text; } }
    class Scene_CraftingMenu {}
    vi.stubGlobal('Game_Party', Party);
    vi.stubGlobal('Window_Base', BaseWindow);
    vi.stubGlobal('SceneManager', { _scene: new Scene_CraftingMenu() });
    const translator = new ItemCombinationMZTranslator();
    const runtime = { isTranslationEnabled: () => true };
    vi.spyOn(translator, 'getRuntime').mockReturnValue(runtime);
    const translate = vi.spyOn(translator, 'translateItemCombinationSceneText').mockReturnValue('Combine');
    expect(translator.enablePluginTranslation()).toBe(true);
    expect(new BaseWindow().drawText('Create')).toBe('Combine');
    expect(translate).toHaveBeenCalledWith('Create', runtime);
    SceneManager._scene = {};
    expect(new BaseWindow().drawText('Create')).toBe('Create');
});
