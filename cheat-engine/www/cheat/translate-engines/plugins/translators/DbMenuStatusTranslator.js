import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * DB_menustatus (MV, unversioned game-authored plugin in RJ393386).
 * Extracts literal drawText labels from the plugin source. Only the menu-status
 * text renderer is hooked; actor names, variable values and the portrait stay intact.
 */
export class DbMenuStatusTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'DB_menustatus';
    }

    getCacheType() {
        return 'plugin_db_menu_status';
    }

    shouldScanEventData() {
        return false;
    }

    enablePluginTranslation() {
        const prototype = window.Window_MenuStatus?.prototype;
        if (typeof prototype?.drawText !== 'function' || typeof prototype?.drawItem !== 'function')
            return false;
        this.hookDrawing(prototype, 'drawText');
        this.precomputeCounts().catch((error) =>
            console.error('[DbMenuStatusTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
