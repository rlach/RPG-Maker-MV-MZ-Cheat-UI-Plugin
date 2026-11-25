/** Per-source recovery history; transport choices never change saved settings. */
export class TagFormatRecovery {
    constructor() {
        this.states = new Map();
    }
    key(item, runtime, format) {
        return JSON.stringify([
            runtime.sourceLang,
            runtime.targetLang,
            format,
            item.type,
            item.value,
        ]);
    }
    next(item, runtime, format) {
        const state = this.states.get(this.key(item, runtime, format));
        if (!state || state.failures < 3) return format;
        return state.alternate++ % 2 === 0 ? (format === 'legacy' ? 'tags' : 'legacy') : format;
    }
    failed(item, runtime, format) {
        const key = this.key(item, runtime, format);
        const state = this.states.get(key) || { failures: 0, alternate: 0 };
        state.failures++;
        this.states.set(key, state);
    }
    succeeded(item, runtime, format) {
        this.states.delete(this.key(item, runtime, format));
    }
}
