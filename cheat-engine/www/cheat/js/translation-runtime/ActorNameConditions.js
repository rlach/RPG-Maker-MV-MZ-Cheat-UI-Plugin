const installed = new WeakMap();

/** Keep native actor-name conditions compatible with translated display names. */
export function installActorNameConditionTranslation(runtime) {
    const prototype = window.Game_Interpreter?.prototype;
    if (typeof prototype?.command111 !== 'function') return;
    if (installed.has(prototype)) {
        installed.set(prototype, runtime);
        return;
    }
    const original = prototype.command111;
    installed.set(prototype, runtime);
    prototype.command111 = function (...args) {
        const current = installed.get(prototype);
        const explicitParams = Array.isArray(args[0]);
        const params = explicitParams ? args[0] : this._params;
        if (
            params?.[0] !== 4 ||
            params[2] !== 1 ||
            !(current.isTranslationEnabled() || current.enableTranslation || current.enabled)
        )
            return original.apply(this, args);
        const actor = window.$gameActors?.actor(params[1]);
        const name = actor?.name();
        if (typeof name !== 'string' || name === params[3]) return original.apply(this, args);
        const key = current.getCacheKey(params[3], 'speaker');
        if (!current.hasUsableCacheValue(key)) return original.apply(this, args);
        const translated = current.translationCache.get(key);
        if (typeof translated !== 'string') return original.apply(this, args);
        const normalized =
            current.normalizeSpeakerNameCase?.(translated.trim()) ?? translated.trim();
        // Only adapt a proven translation of this exact branch token. Manual
        // renames and unrelated actors must retain their native branch result.
        if (name !== translated && name !== normalized) return original.apply(this, args);
        const replacement = [...params];
        replacement[3] = name;
        if (explicitParams) return original.call(this, replacement, ...args.slice(1));
        this._params = replacement;
        try {
            return original.apply(this, args);
        } finally {
            this._params = params;
        }
    };
}
