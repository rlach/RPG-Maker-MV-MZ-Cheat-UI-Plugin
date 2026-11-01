import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * InfoWindow.js (MV, unversioned version shipped in RJ203736).
 * Reads literal display strings from the plugin source for Mass Translation.
 * Window_Info is private to an IIFE: hook the created menu window instance,
 * preserving gauge calculations, variable IDs, numbers and commented-out text.
 */
export class InfoWindowTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'InfoWindow';
    }

    getPluginLabel() {
        return 'InfoWindow menu statistics';
    }

    getCacheType() {
        return 'plugin_info_window';
    }

    shouldScanEventData() {
        return false;
    }

    isDisplayFragment() {
        return false;
    }

    enablePluginTranslation() {
        const prototype = window.Scene_Menu?.prototype;
        if (typeof prototype?.createInfoWindow !== 'function') return false;
        const translator = this;
        const create = prototype.createInfoWindow;
        prototype.createInfoWindow = function (...args) {
            const result = create.apply(this, args);
            translator.hookDrawing(this._InfoWindow, 'drawText');
            return result;
        };
        const existing = window.SceneManager?._scene?._InfoWindow;
        if (existing) this.hookDrawing(existing, 'drawText');
        this.precomputeCounts().catch((error) =>
            console.error('[InfoWindowTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
