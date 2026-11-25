import { BasePluginTranslator } from '../BasePluginTranslator.js';

/** AnimationMapName (MV): refreshMapName variants and Yana 1.00/1.01's
 * animationMapName entry point. Resolve complete names before glyph splitting.
 */
export class AnimationMapNameTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'AnimationMapName';
    }
    enablePluginTranslation() {
        const prototype = window.Game_Interpreter?.prototype;
        if (typeof prototype?.refreshMapName !== 'function') {
            if (
                typeof prototype?.animationMapName !== 'function' ||
                typeof window.CommonPopupManager?.window !== 'function'
            )
                return false;
            const translator = this;
            const animate = prototype.animationMapName;
            prototype.animationMapName = function (...args) {
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime))
                    return animate.apply(this, args);
                const popup = window.CommonPopupManager.window();
                const source = window.$gameMap.displayName() || '';
                const convert = popup.convertEscapeCharacters;
                const descriptor = Object.getOwnPropertyDescriptor(
                    popup,
                    'convertEscapeCharacters'
                );
                popup.convertEscapeCharacters = function (text, ...rest) {
                    const display =
                        text === source
                            ? translator.resolveRuntimeTranslation(source, runtime, 'map_name')
                            : text;
                    return convert.call(this, display, ...rest);
                };
                try {
                    return animate.apply(this, args);
                } finally {
                    if (descriptor)
                        Object.defineProperty(popup, 'convertEscapeCharacters', descriptor);
                    else delete popup.convertEscapeCharacters;
                }
            };
            return true;
        }
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
