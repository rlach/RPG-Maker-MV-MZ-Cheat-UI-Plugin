import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** MOT item sorting header and MNKR TM equipment extra-parameter labels (MZ). */
export class MotMnkrEquipUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MOT_MNKR_EquipmentUI';
    }
    getPluginLabel() {
        return 'MOT / MNKR equipment UI';
    }
    getPluginAliases() {
        return ['MOT_ItemFavoriteSort', 'MNKR_TMEquipStatusExMZ'];
    }
    getCacheType() {
        return 'plugin_mot_mnkr_equipment_ui';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const fields = {
            MOT_ItemFavoriteSort: ['EquipSortHelpWindow1', 'EquipSortHelpWindow2'],
            MNKR_TMEquipStatusExMZ: ['parameterHit', 'parameterEva', 'parameterCri'],
        };
        for (const [plugin, names] of Object.entries(fields)) {
            const entry = this.findPluginEntry(plugin);
            if (!entry?.status) continue;
            for (const field of names) {
                const text = entry.parameters?.[field];
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        if (typeof window.Window_Base?.prototype.textWidth === 'function')
            this.hookDrawing(window.Window_Base.prototype, 'textWidth');
        return true;
    }
}
