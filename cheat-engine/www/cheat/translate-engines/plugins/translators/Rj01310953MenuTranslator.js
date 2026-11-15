import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

export class Rj01310953MenuTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'custom-menu-ui-plugin-complete';
    }
    getCacheType() {
        return 'plugin_rj01310953_menu';
    }
    shouldScanEventData() {
        return false;
    }
    collectSourceCatalog(source) {
        const catalog = super.collectSourceCatalog(source);
        return {
            entries: catalog.entries.filter(
                (entry) => !catalog.entries.some((template) => template.parts?.includes(entry.text))
            ),
        };
    }
    isDisplayFragment() {
        return false;
    }
    enablePluginTranslation() {
        const prototype = window.Bitmap?.prototype;
        if (typeof prototype?.drawText !== 'function') return false;
        this.hookDrawing(prototype, 'drawText');
        this.precomputeCounts().catch((error) =>
            console.error(`[${this.getPluginName()}] Catalog scan failed`, error)
        );
        return true;
    }
}
