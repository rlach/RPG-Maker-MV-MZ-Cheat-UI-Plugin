let depth = 0;
const wrapped = new WeakSet();

export function isVariableDisplayContext() {
    return depth > 0;
}

export function withVariableDisplayContext(callback) {
    depth++;
    try {
        return callback();
    } finally {
        depth--;
    }
}

/** Localize safe string variables only while a text renderer expands escapes. */
export function installVariableDisplayContexts() {
    for (const [prototype, method] of [
        [window.Window_Base?.prototype, 'convertEscapeCharacters'],
        [window.Game_Picture?.prototype, 'updateDText'],
        [window.Window_SceneExtra?.prototype, 'drawAllText'],
    ]) {
        const original = prototype?.[method];
        if (typeof original !== 'function' || wrapped.has(original)) continue;
        const replacement = function (...args) {
            return withVariableDisplayContext(() => original.apply(this, args));
        };
        wrapped.add(replacement);
        prototype[method] = replacement;
    }
}
