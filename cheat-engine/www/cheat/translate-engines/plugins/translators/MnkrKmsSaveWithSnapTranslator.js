import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/**
 * MNKR_KMS_SaveWithSnapMZ v0.1.4 (MZ), including the RJ01284200 custom display.
 * Catalogs plugin labels and formatted chapter/playtime/file text from source.
 * Translates only the save-list presentation, never serialized save information.
 */
export class MnkrKmsSaveWithSnapTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'MNKR_KMS_SaveWithSnapMZ';
    }
    getCacheType() {
        return 'plugin_mnkr_kms_save_with_snap';
    }
    getParameterTextPattern() {
        return /(?:text|label|caption|title)$/i;
    }
    enablePluginTranslation() {
        const prototype = window.Window_SavefileList?.prototype;
        if (typeof prototype?.drawText !== 'function' || typeof prototype?.textWidth !== 'function')
            return false;
        this.hookDrawing(prototype, 'drawText');
        this.hookDrawing(prototype, 'textWidth');
        this.precomputeCounts().catch((error) =>
            console.error('[MnkrKmsSaveWithSnapTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
