import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';

/** STTLA_Synthesis v1.2 (MV) and TsL_Menu, as shipped in RJ326330.
 * Collect configured crafting labels and menu captions; translate at drawing
 * boundaries without changing recipe IDs, quantities, switches or commands.
 */
export class SttlaSynthesisTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'STTLA_Synthesis';
    }
    getPluginLabel() {
        return 'STTLA Synthesis';
    }
    getCacheType() {
        return 'plugin_sttla_synthesis';
    }
    getSourcePluginNames() {
        return [this.getPluginName(), 'TsL_Menu'];
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value) => {
            if (typeof value === 'string' && /[\u3040-\u30ff\u3400-\u9fff]/.test(value))
                this.entries.set(value, { text: value });
        });
    }
}
