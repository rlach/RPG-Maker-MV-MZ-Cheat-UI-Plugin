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

function wrapDisplayContextMethod(prototype, method) {
    const original = prototype?.[method];
    if (typeof original !== 'function' || wrapped.has(original)) return;
    const replacement = function (...args) {
        return withVariableDisplayContext(() => original.apply(this, args));
    };
    wrapped.add(replacement);
    prototype[method] = replacement;
}

/** Localize safe string variables only while a text renderer expands escapes. */
export function installVariableDisplayContexts() {
    for (const [prototype, method] of [
        [window.Window_Base?.prototype, 'convertEscapeCharacters'],
        [window.Game_Picture?.prototype, 'updateDText'],
        [window.Window_SceneExtra?.prototype, 'drawAllText'],
    ]) {
        wrapDisplayContextMethod(prototype, method);
    }

    // Plugins such as GALV_VisualNovelChoices and YEP_MessageCore override
    // convertEscapeCharacters on Window_* subclasses while capturing the
    // unwrapped base method at plugin load time. Wrap those own overrides too.
    for (const key of Object.keys(window)) {
        if (!key.startsWith('Window_') || key === 'Window_Base') continue;
        const ctor = window[key];
        const proto = typeof ctor === 'function' ? ctor.prototype : null;
        if (proto && Object.prototype.hasOwnProperty.call(proto, 'convertEscapeCharacters')) {
            wrapDisplayContextMethod(proto, 'convertEscapeCharacters');
        }
    }
}
