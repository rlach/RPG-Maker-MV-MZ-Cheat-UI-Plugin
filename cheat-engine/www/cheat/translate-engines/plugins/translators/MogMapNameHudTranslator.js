import { BasePluginTranslator } from '../BasePluginTranslator.js';

/** MOG_MapNameHud (MV). Resolve the animated HUD name through map_name at presentation. */
export class MogMapNameHudTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MOG_MapNameHud';
    }
    enablePluginTranslation() {
        const prototype = window.Map_Name_Hud?.prototype;
        if (typeof prototype?.mapName !== 'function') return false;
        const original = prototype.mapName;
        const translator = this;
        prototype.mapName = function (...args) {
            return translator.resolveRuntimeTranslation(
                original.apply(this, args),
                translator.getRuntime(),
                'map_name',
                { requireRuntimeTranslationActive: true }
            );
        };
        return true;
    }
}
