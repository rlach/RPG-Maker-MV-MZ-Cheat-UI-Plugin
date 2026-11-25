import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { withVariableDisplayContext } from '../../../js/translation-runtime/VariableDisplayContext.js';

/**
 * InfoWindow.js (MV, unversioned menu variant in RJ203736 / RJ194421 and map HUD variant in RJ01583227).
 * Reads literal display strings from the plugin source for Mass Translation.
 * Window_Info is private to an IIFE: hook the created menu window instance,
 * wrapping refresh in VariableDisplayContext for direct $gameVariables.value()
 * lines while preserving gauge calculations, variable IDs, numbers and comments.
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

    hookInfoWindow(win) {
        if (!win) return;
        this._hookedWindows ??= new WeakSet();
        if (this._hookedWindows.has(win)) return;
        this._hookedWindows.add(win);
        this.hookDrawing(win, 'drawText');
        if (typeof win.refresh === 'function') {
            const originalRefresh = win.refresh;
            win.refresh = function (...args) {
                return withVariableDisplayContext(() => originalRefresh.apply(this, args));
            };
        }
    }

    enablePluginTranslation() {
        const menuPrototype = window.Scene_Menu?.prototype;
        const prototype =
            typeof menuPrototype?.createInfoWindow === 'function'
                ? menuPrototype
                : window.Scene_Map?.prototype;
        const method = prototype === menuPrototype ? 'createInfoWindow' : 'start';
        if (typeof prototype?.[method] !== 'function') return false;
        const translator = this;
        const create = prototype[method];
        prototype[method] = function (...args) {
            const result = create.apply(this, args);
            translator.hookInfoWindow(this._InfoWindow);
            return result;
        };
        this.hookInfoWindow(window.SceneManager?._scene?._InfoWindow);
        this.precomputeCounts().catch((error) =>
            console.error('[InfoWindowTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
