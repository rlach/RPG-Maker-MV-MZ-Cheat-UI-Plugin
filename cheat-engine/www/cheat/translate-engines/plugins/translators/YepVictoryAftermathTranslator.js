import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';

const LABELS = [
    'Battle Results Text',
    'Battle Drops Text',
    'Level Up Text',
    'Max Level Text',
    'Gained EXP Text',
    'Gained EXP Format',
];

/** YEP_VictoryAftermath 1.07 (MV): all result, drops and experience labels.
 * Read original parameters; translate output only, retaining Yanfly configuration.
 */
export class YepVictoryAftermathTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'YEP_VictoryAftermath';
    }
    getCacheType() {
        return 'plugin_yep_victory_aftermath';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const response = await fetch('js/plugins.js');
        if (!response.ok) throw new Error('Cannot read original victory parameters');
        const plugins = readJavaScriptLiteralData(await response.text(), ['$plugins']).bindings
            .$plugins;
        const plugin = plugins?.find(
            (entry) => entry.name === this.getPluginName() && entry.status
        );
        for (const field of LABELS) {
            const value = plugin?.parameters?.[field];
            if (!this.isUsableText(value)) continue;
            const parts = value.split('%1');
            const text = parts.join('\\COT[0]');
            this.entries.set(text, { text, ...(parts.length > 1 ? { parts } : {}) });
        }
    }
}
