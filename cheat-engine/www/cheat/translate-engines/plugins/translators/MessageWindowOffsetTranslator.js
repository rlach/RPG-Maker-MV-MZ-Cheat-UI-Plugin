import { BasePluginTranslator } from '../BasePluginTranslator.js';

/** MessageWindowOffset (MZ, unversioned): custom name-box measurement and drawing.
 * Reuse canonical speaker/actor_name cache entries only at the refresh boundary.
 */
export class MessageWindowOffsetTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MessageWindowOffset';
    }
    getCacheType() {
        return 'plugin_message_window_offset';
    }
    enablePluginTranslation() {
        const prototype = window.Window_NameBox?.prototype;
        if (typeof prototype?.refresh !== 'function') return false;
        const translator = this;
        // The cheat bootstrap can run before game plugins finish loading.
        // MessageWindowOffset replaces refresh, but keeps the native start and
        // inherited drawTextEx routes. Protect those routes as well.
        for (const method of ['refresh', 'start', 'drawTextEx']) {
            const original = prototype[method];
            if (typeof original !== 'function') continue;
            prototype[method] = function (...args) {
                const runtime = translator.getRuntime();
                const source = method === 'drawTextEx' ? args[0] : this._name;
                if (
                    !translator.isRuntimeTranslationActive(runtime) ||
                    !translator.isUsableText(source)
                )
                    return original.apply(this, args);
                const key = runtime.getCacheKey(source, 'speaker');
                if (!runtime.hasUsableCacheValue(key)) return original.apply(this, args);
                const translated = translator.resolveRuntimeTranslation(
                    source,
                    runtime,
                    'speaker',
                    {
                        harvestMissing: false,
                    }
                );
                if (method === 'drawTextEx')
                    return original.call(this, translated, ...args.slice(1));
                this._name = translated;
                try {
                    return original.apply(this, args);
                } finally {
                    this._name = source;
                }
            };
        }
        return true;
    }
}
