import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { readOriginalUiPlugins, collectMyDisplayParameters } from './MyGameTextCatalog.js';

/** Windowset Builder/Menu (MZ, generated unversioned suite): custom menu,
 * HUD and command captions. Original definitions remain logic/asset sources.
 */
export class WindowsetMenuTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'WindowsetMenu';
    }
    getPluginAliases() {
        return ['WindowsetMenu', 'WindowsetBuilder'];
    }
    getCacheType() {
        return 'plugin_windowset_menu';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts() {
        /* Scan immutable manifest values below. */
    }
    async collectAdditionalTexts() {
        for (const plugin of await readOriginalUiPlugins(this.getPluginAliases()))
            collectMyDisplayParameters(plugin.parameters, this.entries);
    }
}
