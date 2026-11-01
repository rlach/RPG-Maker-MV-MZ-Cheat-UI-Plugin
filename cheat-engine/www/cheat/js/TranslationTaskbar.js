const controllers = new WeakMap();

/** Optional native NW.js taskbar feedback, owned by the game window. */
export class TranslationTaskbar {
    constructor(runtime, hostWindow = globalThis.window) {
        this.runtime = runtime;
        this.host = hostWindow;
        while (this.host?.__CHEAT_EXTERNAL_WINDOW__ && this.host.opener && !this.host.opener.closed)
            this.host = this.host.opener;
        this.operations = new Map();
        this.nativeWindow = null;
        this.lastProgress = -1;
    }

    invoke(method, value) {
        try {
            if (!this.nativeWindow) {
                const native = this.host?.nw?.Window?.get(this.host);
                if (!native) return;
                this.nativeWindow = native;
                native.on?.('focus', () => this.invoke('requestAttention', false));
            }
            this.nativeWindow[method]?.(value);
            if (method === 'requestAttention') this.attentionRequested = value;
        } catch (error) {
            // Native desktop feedback must never fail a translation request.
            if (!this.warned)
                console.warn('[TranslationTaskbar] Native taskbar unavailable', error);
            this.warned = true;
        }
    }

    begin(channel = 'main', dryRun = false) {
        if (dryRun) return () => {};
        const token = { channel, progress: 0 };
        this.operations.set(token, token);
        this.sync();
        let finished = false;
        return () => {
            if (finished) return;
            finished = true;
            this.operations.delete(token);
            this.sync();
            if (
                !this.operations.size &&
                this.runtime.flashTaskbarOnTranslationComplete &&
                !this.host?.document?.hasFocus?.()
            )
                this.invoke('requestAttention', true);
        };
    }

    update(channel, stats) {
        if (!stats || !(stats.totalChars > 0)) return;
        for (const token of this.operations.values()) {
            if (token.channel === channel)
                token.progress = Math.min(
                    0.999,
                    Math.max(0, stats.processedChars / stats.totalChars)
                );
        }
        this.sync();
    }

    sync() {
        if (!this.runtime.flashTaskbarOnTranslationComplete && this.attentionRequested)
            this.invoke('requestAttention', false);
        const tokens = [...this.operations.values()];
        const active = tokens.find((token) => token.channel === 'main') || tokens[0];
        const progress =
            this.runtime.showTranslationTaskbarProgress && active ? active.progress : -1;
        if (progress === this.lastProgress) return;
        this.lastProgress = progress;
        this.invoke('setProgressBar', progress);
    }
}

export function translationTaskbarFor(runtime) {
    if (!controllers.has(runtime)) controllers.set(runtime, new TranslationTaskbar(runtime));
    return controllers.get(runtime);
}
