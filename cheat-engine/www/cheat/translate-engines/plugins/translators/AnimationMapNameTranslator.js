import { BasePluginTranslator } from '../BasePluginTranslator.js';

/** AnimationMapName (MV). Resolve the complete map name before the plugin splits it into glyphs. */
export class AnimationMapNameTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'AnimationMapName';
    }
    enablePluginTranslation() {
        const prototype = window.Game_Interpreter?.prototype;
        if (typeof prototype?.refreshMapName !== 'function') return false;
        const translator = this;
        const refresh = prototype.refreshMapName;
        prototype.refreshMapName = function (params) {
            const runtime = translator.getRuntime();
            const source = params.text || window.$gameMap.displayName();
            const text = translator.isRuntimeTranslationActive(runtime)
                ? translator.resolveRuntimeTranslation(source, runtime, 'map_name')
                : source;
            return refresh.call(this, { ...params, text });
        };
        return true;
    }
}
