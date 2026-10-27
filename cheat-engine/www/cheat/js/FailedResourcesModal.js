/** Optional MV/MZ loading-error controls. Cancellations last until game restart. */
export class FailedResourcesModal {
    constructor(root) {
        this.root = root;
        this.enabled = false;
        this.cancelled = new Set();
        this.reloaders = new WeakMap();
        this.targets = new Map();
        this.buttons = [];
    }

    key(url) {
        try {
            return decodeURIComponent(String(url));
        } catch {
            return String(url);
        }
    }

    isCancelled(url) {
        return this.cancelled.has(this.key(url));
    }

    fullPath(url) {
        const root = this.root;
        const decoded = this.key(url);
        if (/^[a-z]:[\\/]|^\\\\/i.test(decoded)) return decoded;
        const require = root.require;
        if (/^file:/i.test(url) && require) return require('url').fileURLToPath(url);
        if (require && !/^[a-z][a-z\d+.-]*:/i.test(url)) {
            const path = require('path');
            const entry = root.process?.mainModule?.filename;
            if (entry) return path.resolve(path.dirname(entry), decoded);
        }
        return this.key(new URL(url, root.document.baseURI || root.location.href).href);
    }

    async copyPath(url) {
        const text = this.fullPath(url);
        const root = this.root;
        if (root.nw?.Clipboard) return root.nw.Clipboard.get().set(text, 'text');
        if (root.navigator?.clipboard?.writeText) return root.navigator.clipboard.writeText(text);
        const input = root.document.createElement('textarea');
        input.value = text;
        root.document.body.appendChild(input);
        try {
            input.select();
            if (!root.document.execCommand('copy')) throw new Error('Clipboard copy failed');
        } finally {
            input.remove();
        }
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!enabled) this.removeButtons();
        else if (this.current) this.show(this.current.url, this.current.cancel);
    }

    removeButtons() {
        for (const button of this.buttons) button.remove();
        this.buttons = [];
    }

    show(url, cancel) {
        this.current = { url, cancel };
        this.removeButtons();
        const printer = this.root.Graphics._errorPrinter;
        if (!this.enabled || !printer) return;
        for (const [label, action] of [
            ['Copy path', () => this.copyPath(url)],
            ['Cancel', cancel],
        ]) {
            const button = printer.ownerDocument.createElement('button');
            button.textContent = label;
            button.style.cssText =
                'font-size:24px;color:white;background:black;margin-left:8px;cursor:pointer';
            button.onmousedown = button.ontouchstart = (event) => event.stopPropagation();
            button.onclick = (event) => {
                event.stopPropagation();
                Promise.resolve()
                    .then(action)
                    .catch((error) => console.warn('[FailedResourcesModal]', error));
            };
            printer.appendChild(button);
            this.buttons.push(button);
        }
    }

    blankBitmap(bitmap) {
        if (bitmap.__cheatResourceCancelled) return;
        bitmap.__cheatResourceCancelled = true;
        // Both engines lazily draw _image when creating a canvas. A failed
        // HTMLImageElement must be detached before resize touches that canvas.
        if (bitmap._image) {
            bitmap._image.onload = null;
            bitmap._image.onerror = null;
            bitmap._image = null;
        }
        bitmap._loadingState = 'loaded';
        bitmap.resize(1, 1);
        const canvas = bitmap.canvas || bitmap._canvas;
        if (canvas) bitmap._createBaseTexture?.(canvas);
        bitmap._callLoadListeners?.();
    }

    cancel(url) {
        this.cancelled.add(this.key(url));
        this.targets.get(this.key(url))?.();
        const root = this.root;
        for (const cache of [
            root.ImageManager?._cache,
            root.ImageManager?._system,
            root.ImageManager?._imageCache?._items,
        ]) {
            for (const entry of Object.values(cache || {})) {
                const bitmap = entry?.bitmap || entry;
                if (this.isCancelled(bitmap?._url || bitmap?.url)) this.blankBitmap(bitmap);
            }
        }
        const audio = root.AudioManager;
        for (const buffer of [
            audio?._bgmBuffer,
            audio?._bgsBuffer,
            audio?._meBuffer,
            ...(audio?._seBuffers || []),
            ...(audio?._staticBuffers || []),
        ]) {
            if (buffer && this.isCancelled(buffer._url || buffer.url)) buffer.stop();
        }
        const handler = root.ResourceHandler;
        if (handler?._reloaders) {
            // Preserve unrelated pending failures, including the native Retry action.
            for (let i = handler._reloaders.length - 1; i >= 0; i--) {
                const key = this.reloaders.get(handler._reloaders[i]);
                if ((key && this.key(key) === this.key(url)) || (i === 0 && !key))
                    handler._reloaders.splice(i, 1);
            }
            if (handler._reloaders.length) {
                const next = this.reloaders.get(handler._reloaders[0]);
                if (next) root.Graphics.printLoadingError(next);
                else handler.retry();
                return;
            }
        }
        this.removeButtons();
        if (root.Graphics.eraseLoadingError) root.Graphics.eraseLoadingError();
        else root.Graphics.eraseError();
        root.SceneManager.resume();
    }

    install() {
        const root = this.root;
        if (this.installed) return true;
        if (!root.Graphics || !root.SceneManager) return false;
        const hack = this;
        const wrap = (object, name, factory) => {
            if (typeof object?.[name] === 'function') object[name] = factory(object[name]);
        };
        wrap(
            root.ResourceHandler,
            'createLoader',
            (original) =>
                function (url, retry, resign, intervals) {
                    const loader = original.call(
                        this,
                        url,
                        () => {
                            if (!hack.isCancelled(url)) retry();
                        },
                        () => {
                            if (!hack.isCancelled(url)) resign?.();
                        },
                        intervals
                    );
                    return function (...args) {
                        if (hack.isCancelled(url)) return;
                        const before = root.ResourceHandler._reloaders.length;
                        try {
                            return loader.apply(this, args);
                        } finally {
                            for (const reloader of root.ResourceHandler._reloaders.slice(before))
                                hack.reloaders.set(reloader, url);
                        }
                    };
                }
        );
        wrap(
            root.Graphics,
            'printLoadingError',
            (original) =>
                function (url) {
                    const result = original.apply(this, arguments);
                    hack.show(url, () => hack.cancel(url));
                    return result;
                }
        );
        for (const method of ['eraseLoadingError', 'eraseError'])
            wrap(
                root.Graphics,
                method,
                (original) =>
                    function (...args) {
                        hack.current = null;
                        hack.removeButtons();
                        return original.apply(this, args);
                    }
            );
        // MZ passes the failed URL and retry closure to catchLoadError. Capture
        // resource-specific cancellation at the manager that owns that closure.
        wrap(
            root.SceneManager,
            'catchLoadError',
            (original) =>
                function (error) {
                    const result = original.apply(this, arguments);
                    hack.show(error[1], () => hack.cancel(error[1]));
                    return result;
                }
        );
        wrap(
            root.ImageManager,
            'throwLoadError',
            (original) =>
                function (bitmap) {
                    hack.targets.set(hack.key(bitmap.url), () => hack.blankBitmap(bitmap));
                    if (hack.isCancelled(bitmap.url)) return hack.blankBitmap(bitmap);
                    return original.apply(this, arguments);
                }
        );
        wrap(
            root.AudioManager,
            'throwLoadError',
            (original) =>
                function (audio) {
                    hack.targets.set(hack.key(audio.url), () => audio.stop());
                    if (!hack.isCancelled(audio.url)) return original.apply(this, arguments);
                }
        );
        wrap(
            root.FontManager,
            'throwLoadError',
            (original) =>
                function (family) {
                    const url = this._urls[family];
                    hack.targets.set(hack.key(url), () => {
                        this._states[family] = 'loaded';
                    });
                    if (hack.isCancelled(url)) {
                        this._states[family] = 'loaded';
                        return;
                    }
                    return original.apply(this, arguments);
                }
        );
        wrap(
            root.Video,
            '_onError',
            (original) =>
                function (...args) {
                    const url = this._element.src;
                    hack.targets.set(hack.key(url), () => {
                        this._element.pause();
                        this._onEnd();
                    });
                    if (hack.isCancelled(url)) {
                        this._onEnd();
                        return;
                    }
                    return original.apply(this, args);
                }
        );
        for (const Class of [root.Bitmap, root.WebAudio, root.Html5Audio]) {
            const proto = Class === root.Html5Audio ? Class : Class?.prototype;
            for (const method of ['isError', 'isReady', 'play'])
                wrap(
                    proto,
                    method,
                    (original) =>
                        function (...args) {
                            if (hack.isCancelled(this._url || this.url)) {
                                if (Class === root.Bitmap) hack.blankBitmap(this);
                                return method === 'isReady';
                            }
                            return original.apply(this, args);
                        }
                );
            for (const method of ['_requestImage', '_load', '_startLoading', '_onError'])
                wrap(
                    proto,
                    method,
                    (original) =>
                        function (...args) {
                            const url =
                                (typeof args[0] === 'string' && args[0]) || this._url || this.url;
                            if (hack.isCancelled(url)) {
                                if (Class === root.Bitmap) hack.blankBitmap(this);
                                return;
                            }
                            return original.apply(this, args);
                        }
                );
        }
        this.installed = true;
        // Allow enabling from the overlay while an MV loading error is already
        // visible, even if the failing loader predates this optional hook.
        const message = Array.from(root.Graphics._errorPrinter?.querySelectorAll?.('font') || [])
            .map((node) => node.textContent)
            .find((text) => text.startsWith('Failed to load: '));
        if (message) {
            const url = message.slice('Failed to load: '.length);
            this.show(url, () => this.cancel(url));
        }
        return true;
    }
}
