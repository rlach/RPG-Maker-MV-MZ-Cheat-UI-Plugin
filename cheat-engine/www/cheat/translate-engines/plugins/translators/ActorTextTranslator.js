import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';

/** ActorText v1.1 (MZ). Shared descriptions consumed by party selection and status. */
export class ActorTextTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'ActorText';
    }
    getCacheType() {
        return 'plugin_actor_text';
    }
    getParameterTextPattern() {
        return /Description$/;
    }
    enablePluginTranslation() {
        if (typeof window.getActorDescription !== 'function') return false;
        const original = window.getActorDescription;
        const translator = this;
        window.getActorDescription = function (...args) {
            const text = original.apply(this, args);
            return translator.resolveRuntimeTranslation(
                text,
                translator.getRuntime(),
                translator.getCacheType(),
                { requireRuntimeTranslationActive: true }
            );
        };
        return true;
    }
}
