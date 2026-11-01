import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseStructArraySafely } from './TranslatorHelpers.js';

/** NUUN_Destination v1.0.2 (MZ): parameter text selected by numeric destination ID. */
export class NuunDestinationTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'NUUN_Destination';
    }
    getCacheType() {
        return 'plugin_nuun_destination';
    }
    shouldScanEventData() {
        return false;
    }
    isDisplayFragment() {
        return false;
    }

    collectParameterTexts(parameters) {
        for (const item of parseStructArraySafely(parameters.DestinationList)) {
            if (this.isUsableText(item.DestinationText))
                this.entries.set(item.DestinationText, { text: item.DestinationText });
        }
    }
    enablePluginTranslation() {
        const prototypes = [window.Window_Base?.prototype, window.Game_System?.prototype];
        if (prototypes.some((prototype) => typeof prototype?.getDestinationList !== 'function'))
            return false;
        const translator = this;
        for (const prototype of prototypes) {
            const original = prototype.getDestinationList;
            prototype.getDestinationList = function (...args) {
                return translator.resolveText(original.apply(this, args), translator.getRuntime());
            };
        }
        this.precomputeCounts().catch((error) =>
            console.error('[NuunDestinationTranslator] Scan failed', error)
        );
        return true;
    }
}
