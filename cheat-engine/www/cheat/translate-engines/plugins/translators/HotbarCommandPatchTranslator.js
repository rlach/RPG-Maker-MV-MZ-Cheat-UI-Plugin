import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** Patch_ItemSubCommand_Hotbar (MZ, installed build). Catalogs display literals and parameters; preserves logic-owned values. */
export class HotbarCommandPatchTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'Patch_ItemSubCommand_Hotbar';
    }
    getPluginLabel() {
        return 'Item Subcommand Hotbar Patch';
    }
    getCacheType() {
        return 'plugin_patch_itemsubcommand_hotbar';
    }
    getParameterTextPattern() {
        return /^Hotbar Command Name$/;
    }
}
