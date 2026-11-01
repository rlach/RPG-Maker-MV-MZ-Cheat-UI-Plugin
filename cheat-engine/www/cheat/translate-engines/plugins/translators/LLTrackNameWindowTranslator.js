import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseStructArraySafely } from './TranslatorHelpers.js';

/**
 * LL_TrackNameWindow v1.1.0 (MZ): parameter-defined BGM notification titles.
 * Translates trackName and the options label only, never trackFile/audio IDs.
 * Window_TrackName is private: patch the instance created by Scene_Map.
 */
export class LLTrackNameWindowTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'LL_TrackNameWindow';
    }
    getCacheType() {
        return 'plugin_ll_track_name_window';
    }
    shouldScanEventData() {
        return false;
    }
    isDisplayFragment() {
        return false;
    }
    collectParameterTexts(parameters) {
        for (const item of parseStructArraySafely(parameters.trackLists)) {
            if (this.isUsableText(item.trackName))
                this.entries.set(item.trackName, { text: item.trackName });
        }
        if (this.isUsableText(parameters.optionCommandName))
            this.entries.set(parameters.optionCommandName, { text: parameters.optionCommandName });
    }
    enablePluginTranslation() {
        const prototype = window.Scene_Map?.prototype;
        if (
            typeof prototype?.createTrackNameWindow !== 'function' ||
            typeof window.Window_Options?.prototype.drawText !== 'function'
        )
            return false;
        const translator = this;
        const create = prototype.createTrackNameWindow;
        prototype.createTrackNameWindow = function (...args) {
            const result = create.apply(this, args);
            translator.hookDrawing(this._trackNameWindow, 'drawText');
            this._trackNameWindow.refresh();
            return result;
        };
        const existing = window.SceneManager?._scene?._trackNameWindow;
        if (existing) this.hookDrawing(existing, 'drawText');
        this.hookDrawing(window.Window_Options.prototype, 'drawText');
        this.precomputeCounts().catch((error) =>
            console.error('[LLTrackNameWindowTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
