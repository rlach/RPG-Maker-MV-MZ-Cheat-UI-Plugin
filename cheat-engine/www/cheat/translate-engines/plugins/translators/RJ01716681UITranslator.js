import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * RJ01716681 MZ custom UI scripts (no declared version): save/load summary,
 * modified MenuSubCommand day/location display, help/progress/wonders panels
 * and MyDisplayFunctions battle text. SceneCustomMenu displays skill.note as
 * its battle help, including skills whose standard description is empty.
 * Translate presentation only; save metadata, skill notes, IDs, switches and
 * authored expressions stay untouched. COT templates retain dynamic values.
 */
export class RJ01716681UITranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'RJ01716681UI';
    }
    getPluginLabel() {
        return 'RJ01716681 save, menu and battle UI';
    }
    getCacheType() {
        return 'plugin_rj01716681_ui';
    }
    getPluginAliases() {
        return [
            'CustomSaveLayout_new',
            'MenuSubCommand',
            'MyDisplayFunctions',
            'getHelpTitles',
            'getEventProgressTitles',
            'SevenWondersDisplay',
        ];
    }
    detectPlugin() {
        // MenuSubCommand alone is generic and must not activate this adapter
        // in unrelated games or scan their technical skill notes.
        return (
            !!this.findPluginEntry('CustomSaveLayout_new')?.status &&
            !!this.findPluginEntry('MyDisplayFunctions')?.status
        );
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const response = await fetch('data/Skills.json');
        if (!response.ok) throw new Error(`Cannot read Skills: ${response.status}`);
        for (const skill of await response.json()) {
            if (this.isUsableText(skill?.note)) this.entries.set(skill.note, { text: skill.note });
        }
    }
}
