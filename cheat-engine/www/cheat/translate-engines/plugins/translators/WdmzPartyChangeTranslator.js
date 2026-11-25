import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** WDmzPartyChange (MZ) and optional Layout1/Layout2: list captions,
 * sorting labels and dismissal commands are immutable plugin script literals.
 * Only drawing is translated; party membership and sort identifiers stay original.
 */
export class WdmzPartyChangeTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'WDmzPartyChange';
    }
    getPluginAliases() {
        return ['WDmzPartyChange', 'WDmzPartyChangeLayout1', 'WDmzPartyChangeLayout2'];
    }
    getCacheType() {
        return 'plugin_wdmz_party_change';
    }
    shouldScanEventData() {
        return false;
    }
}
