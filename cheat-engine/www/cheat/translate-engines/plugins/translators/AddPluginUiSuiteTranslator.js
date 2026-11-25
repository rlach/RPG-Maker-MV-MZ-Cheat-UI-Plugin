import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Author-written AddPlugin suite (MZ, RJ01496388). Read display literals and
 * label arrays from original enabled scripts; draw/measure translated values
 * without modifying menu data, identifiers, combat logic, or stored state.
 */
export class AddPluginUiSuiteTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'AddPlugin_StatusActorMenu';
    }
    getPluginAliases() {
        return [
            'AddPlugin_Base',
            'AddPlugin_ChangeBasicSpeed',
            'AddPlugin_WeaponsAreaChecker',
            'AddPlugin_PictureUpAnimation',
            'AddPlugin_StatusActorMenu',
            'AddPlugin_IconShortcut',
            'AddPlugin_StateDisplayTarget',
            'AddPlugin_StateRLMove',
            'AddPlugin_SecondWeaponChange',
            'AddPlugin_ShowFirstActorSkills',
            'AddPlugin_RegenerateSwitches',
        ];
    }
    getCacheType() {
        return 'plugin_add_plugin_ui_suite';
    }
    shouldScanEventData() {
        return false;
    }
}
