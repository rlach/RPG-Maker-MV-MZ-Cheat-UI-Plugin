import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** DarkPlasma IndividualItemCommand and discard extensions (MZ).
 * Scan original display labels, preserve command symbols and item rules.
 * Shared drawing hooks also translate textSizeEx measurements for popup sizing.
 */
export class DarkPlasmaIndividualItemCommandTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'DarkPlasma_IndividualItemCommand';
    }
    getPluginAliases() {
        return [
            'DarkPlasma_IndividualItemCommand',
            'DarkPlasma_DiscardItemCommand',
            'DarkPlasma_CommonEventByDiscardItem',
        ];
    }
    getCacheType() {
        return 'plugin_darkplasma_individual_item_command';
    }
    shouldScanEventData() {
        return false;
    }
}
