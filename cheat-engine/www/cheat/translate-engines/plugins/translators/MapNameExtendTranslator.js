import { BasePluginTranslator } from '../BasePluginTranslator.js';

/** MapNameExtend v1.2.0 (MV) / v1.9.0 (MZ), triacontane. Translate formatted names before measuring and drawing. */
export class MapNameExtendTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MapNameExtend';
    }

    enablePluginTranslation() {
        const prototype = window.Window_MapName?.prototype;
        if (typeof prototype?.drawTextEx !== 'function') return false;
        const translator = this;
        for (const method of ['drawText', 'drawTextEx', 'textSizeEx', 'textWidth']) {
            if (typeof prototype[method] !== 'function') continue;
            const original = prototype[method];
            prototype[method] = function (text, ...args) {
                const runtime = translator.getRuntime();
                const source = window.$gameMap.displayName();
                if (
                    translator.isRuntimeTranslationActive(runtime) &&
                    translator.isUsableText(source) &&
                    typeof text === 'string' &&
                    text.includes(source)
                ) {
                    text = text.replace(source, () =>
                        translator.resolveRuntimeTranslation(source, runtime, 'map_name')
                    );
                }
                return original.call(this, text, ...args);
            };
        }
        return true;
    }
}
