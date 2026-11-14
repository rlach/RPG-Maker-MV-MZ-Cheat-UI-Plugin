import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * LL_VariableWindow v1.0.0 (MZ), including the RJ01284200 custom result labels.
 * Catalogs source display text and hooks the closure-private variable windows
 * through their scene factory. Variable IDs, values and result deltas stay intact.
 */
export class LlVariableWindowTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'LL_VariableWindow';
    }
    getCacheType() {
        return 'plugin_ll_variable_window';
    }
    shouldScanEventData() {
        return false;
    }
    hookVariableWindows(scene) {
        this.prototypes ??= new WeakSet();
        for (let id = 1; id <= 4; id++) {
            const instance = scene?.[`_exVariableWindow${id}`];
            if (!instance) continue;
            const prototype = Object.getPrototypeOf(instance);
            if (this.prototypes.has(prototype)) continue;
            this.prototypes.add(prototype);
            this.hookDrawing(prototype, 'drawText');
            this.hookDrawing(prototype, 'textWidth');
        }
    }
    enablePluginTranslation() {
        const prototype = window.Scene_Map?.prototype;
        if (typeof prototype?.createExVariableWindow !== 'function') return false;
        const original = prototype.createExVariableWindow;
        const translator = this;
        prototype.createExVariableWindow = function (...args) {
            const result = original.apply(this, args);
            translator.hookVariableWindows(this);
            return result;
        };
        this.hookVariableWindows(window.SceneManager?._scene);
        this.precomputeCounts().catch((error) =>
            console.error('[LlVariableWindowTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
