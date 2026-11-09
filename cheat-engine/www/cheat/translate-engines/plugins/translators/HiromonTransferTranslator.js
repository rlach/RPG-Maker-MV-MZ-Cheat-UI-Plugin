import { BasePluginTranslator } from '../BasePluginTranslator.js';

/** Hiromon SLG Ver1.5 (MV). Actor 26 stores a destination token used by
 * event-command actor-name conditions before map transfers. Compare against
 * the same cached speaker spelling used by command320, without changing saved
 * actor names, event lists, or the display translation.
 */
export class HiromonTransferTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'HiromonTransfer';
    }
    getPluginLabel() {
        return 'Hiromon destination actor compatibility';
    }
    getCacheType() {
        return 'plugin_hiromon_transfer';
    }
    detectPlugin() {
        return [window.$dataSystem?.gameTitle, window.document?.title].some((title) =>
            title?.startsWith('ヒロモンSLG')
        );
    }
    enablePluginTranslation() {
        if (!window.Game_Interpreter?.prototype.command111) return false;
        const translator = this;
        const original = window.Game_Interpreter.prototype.command111;
        window.Game_Interpreter.prototype.command111 = function (...args) {
            const params = this._params;
            const runtime = translator.getRuntime();
            if (
                params?.[0] !== 4 ||
                params[1] !== 26 ||
                params[2] !== 1 ||
                !translator.isRuntimeTranslationActive(runtime)
            )
                return original.apply(this, args);

            const actor = window.$gameActors.actor(26);
            // An original token is already valid. In particular, a missing
            // translation must never change the native branch result.
            if (!actor || actor.name() === params[3]) return original.apply(this, args);
            const key = runtime.getCacheKey(params[3], 'speaker');
            if (!runtime.hasUsableCacheValue(key)) return original.apply(this, args);
            const translated = runtime.normalizeSpeakerNameCase(
                runtime.translationCache.get(key).trim()
            );
            this._params = [...params.slice(0, 3), translated];
            try {
                return original.apply(this, args);
            } finally {
                this._params = params;
            }
        };
        return true;
    }
}
