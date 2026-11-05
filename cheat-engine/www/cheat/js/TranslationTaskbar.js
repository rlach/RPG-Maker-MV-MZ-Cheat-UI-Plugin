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
                const stopAttention = () => {
                    clearInterval(this.attentionTimer);
                    this.attentionTimer = null;
                    if (this.attentionRequested) this.invoke('requestAttention', false);
                };
                // NW.js 0.49 implements on('focus') by assigning window.onfocus.
                // Use an independent DOM listener so game handlers remain intact.
                if (this.host.addEventListener) {
                    this.host.addEventListener('focus', stopAttention);
                } else {
                    native.on?.('focus', stopAttention);
                }
            }
            if (
                method === 'requestAttention' &&
                this.host?.chrome?.windows?.update &&
                Number.isInteger(this.nativeWindow.cWindow?.id)
            ) {
                // NW.js issue #7659: requestAttentionInternal loses its AppWindow.
                // Target the native Chromium window explicitly instead.
                this.host.chrome.windows.update(
                    this.nativeWindow.cWindow.id,
                    { drawAttention: !!value },
                    () => {
                        const error = this.host.chrome.runtime?.lastError;
                        if (error && !this.warned) {
                            console.warn('[TranslationTaskbar] Native taskbar unavailable', error);
                            this.warned = true;
                        }
                        if (error) {
                            this.attentionRequested = false;
                            clearInterval(this.attentionTimer);
                            this.attentionTimer = null;
                        }
                    }
                );
            } else {
                this.nativeWindow[method]?.(value);
            }
            if (method === 'requestAttention') this.attentionRequested = value;
        } catch (error) {
            // Native desktop feedback must never fail a translation request.
            if (!this.warned)
                console.warn('[TranslationTaskbar] Native taskbar unavailable', error);
            this.warned = true;
        }
    }

    flash() {
        if (this.host?.document?.hasFocus?.()) return;
        clearInterval(this.attentionTimer);
        const value = true;
        this.invoke('requestAttention', value);
        this.attentionTimer = setInterval(() => {
            if (this.host?.document?.hasFocus?.() || !this.attentionRequested) {
                clearInterval(this.attentionTimer);
                this.attentionTimer = null;
                if (this.attentionRequested) this.invoke('requestAttention', false);
                return;
            }
            // Rearm attention after the platform-defined flash duration.
            this.invoke('requestAttention', false);
            this.invoke('requestAttention', value);
        }, 3000);
        this.attentionTimer.unref?.();
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
                this.flash();
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
