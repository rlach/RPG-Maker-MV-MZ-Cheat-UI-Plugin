import { afterEach, expect, it, vi } from 'vitest';
import path from 'node:path';
import { FailedResourcesModal } from '../cheat-engine/www/cheat/js/FailedResourcesModal.js';

afterEach(() => vi.useRealTimers());

function fixture(mz = false) {
    const doc = {
        baseURI: 'file:///C:/Game/www/index.html',
        createElement: (tag) => ({
            tag,
            style: {},
            ownerDocument: doc,
            remove() {
                if (this.parent)
                    this.parent.children = this.parent.children.filter((x) => x !== this);
            },
        }),
    };
    const printer = {
        ownerDocument: doc,
        children: [],
        appendChild(button) {
            button.parent = this;
            this.children.push(button);
        },
    };
    class Bitmap {
        constructor(url) {
            this._url = url;
            this.url = url;
            this._loadingState = 'error';
        }
        isError() {
            return this._loadingState === 'error';
        }
        isReady() {
            return this._loadingState === 'loaded';
        }
        resize(w, h) {
            this.width = w;
            this.height = h;
        }
        _callLoadListeners = vi.fn();
    }
    class Audio {
        constructor(url) {
            this._url = url;
            this.url = url;
        }
        isError() {
            return true;
        }
        isReady() {
            return false;
        }
        stop = vi.fn();
        played = vi.fn();
        loaded = vi.fn();
        play() {
            this.played();
        }
        _load() {
            this.loaded();
        }
    }
    const root = {
        document: doc,
        Bitmap,
        WebAudio: Audio,
        process: { mainModule: { filename: 'C:\\Game\\www\\index.html' } },
        require: () => path.win32,
        nw: { Clipboard: { get: () => ({ set: copy }) } },
        ImageManager: {
            _cache: {},
            throwLoadError(bitmap) {
                throw ['LoadError', bitmap.url, () => {}];
            },
        },
        AudioManager: {
            _seBuffers: [],
            throwLoadError(audio) {
                throw ['LoadError', audio.url, () => {}];
            },
        },
        Graphics: {
            _errorPrinter: printer,
            printLoadingError(url) {
                this.lastUrl = url;
                printer.children = [{ textContent: 'Retry' }];
            },
            eraseLoadingError() {
                printer.children = [];
            },
            eraseError() {
                printer.children = [];
            },
        },
        SceneManager: {
            stop: vi.fn(),
            resume: vi.fn(),
            catchLoadError(e) {
                root.Graphics.printLoadingError(e[1]);
            },
        },
    };
    if (!mz)
        root.ResourceHandler = {
            _reloaders: [],
            createLoader(url, retry, resign, intervals = [1]) {
                const reloaders = this._reloaders;
                let count = 0;
                return () => {
                    if (count < intervals.length) {
                        setTimeout(retry, intervals[count++]);
                    } else {
                        resign?.();
                        if (!reloaders.length) {
                            root.Graphics.printLoadingError(url);
                            root.SceneManager.stop();
                        }
                        reloaders.push(() => {
                            count = 0;
                            retry();
                        });
                    }
                };
            },
            retry() {
                const queue = this._reloaders.splice(0);
                queue.forEach((fn) => fn());
            },
        };
    const hack = new FailedResourcesModal(root);
    hack.setEnabled(true);
    hack.install();
    return { root, hack, printer };
}
const copy = vi.fn();

it('adds controls beside Retry and copies the full decoded filesystem path', async () => {
    const { root, printer, hack } = fixture();
    root.Graphics.printLoadingError('audio/se/M%E3%83%8C%E3%82%B1B13.ogg');
    expect(printer.children.map((x) => x.textContent)).toEqual(['Retry', 'Copy path', 'Cancel']);
    await hack.copyPath('audio/se/M%E3%83%8C%E3%82%B1B13.ogg');
    expect(copy).toHaveBeenLastCalledWith('C:\\Game\\www\\audio\\se\\MヌケB13.ogg', 'text');
    hack.setEnabled(false);
    expect(printer.children.map((x) => x.textContent)).toEqual(['Retry']);
    root.Graphics.printLoadingError('other.png');
    expect(printer.children).toHaveLength(1);
});

it('MV cancels only the selected failure, blanks images and retains unrelated Retry requests', () => {
    const { root, hack } = fixture();
    const image = new root.Bitmap('img/missing.png');
    image._image = { onerror: () => {}, onload: () => {} };
    root.ImageManager._cache.a = image;
    const retryImage = vi.fn(),
        retryAudio = vi.fn();
    const imageError = root.ResourceHandler.createLoader(image.url, retryImage, null, []);
    const audioError = root.ResourceHandler.createLoader('audio/other.ogg', retryAudio, null, []);
    imageError();
    audioError();
    hack.cancel(image.url);
    expect(root.ResourceHandler._reloaders).toHaveLength(1);
    expect(root.Graphics.lastUrl).toBe('audio/other.ogg');
    expect(image.isReady()).toBe(true);
    expect(image.isError()).toBe(false);
    expect(image.width).toBe(1);
    expect(image._image).toBeNull();
    expect(root.SceneManager.resume).not.toHaveBeenCalled();
    root.ResourceHandler.retry();
    expect(retryAudio).toHaveBeenCalledOnce();
    expect(retryImage).not.toHaveBeenCalled();
});

it('does not resurrect controls after native Retry clears the error', () => {
    const { root, hack, printer } = fixture();
    root.Graphics.printLoadingError('img/missing.png');
    root.Graphics.eraseLoadingError();
    hack.setEnabled(false);
    hack.setEnabled(true);
    expect(printer.children).toHaveLength(0);
});

it('MZ cancels failed fonts with a fallback and closes failed video playback', () => {
    const { root } = fixture(true);
    root.FontManager = {
        _urls: { GameFont: 'fonts/missing.woff' },
        _states: { GameFont: 'error' },
        throwLoadError() {
            throw ['LoadError', this._urls.GameFont, () => {}];
        },
    };
    root.Video = {
        _element: { src: 'file:///C:/Game/www/missing.webm', pause: vi.fn() },
        _onEnd: vi.fn(),
        _onError() {
            throw ['LoadError', this._element.src, () => {}];
        },
    };
    // The real runtime installs once after engine classes exist.
    const hack = new FailedResourcesModal(root);
    hack.setEnabled(true);
    hack.install();
    try {
        root.FontManager.throwLoadError('GameFont');
    } catch {
        /* Native load exception. */
    }
    hack.cancel('fonts/missing.woff');
    expect(root.FontManager._states.GameFont).toBe('loaded');
    try {
        root.Video._onError();
    } catch {
        /* Native load exception. */
    }
    hack.cancel(root.Video._element.src);
    expect(root.Video._element.pause).toHaveBeenCalledOnce();
    expect(root.Video._onEnd).toHaveBeenCalledOnce();
});

it('MV suppresses already scheduled retry callbacks and future loads of a cancelled file', async () => {
    vi.useFakeTimers();
    const { root, hack } = fixture();
    const retry = vi.fn();
    const url = 'audio/se/missing.ogg';
    const loader = root.ResourceHandler.createLoader(url, retry);
    loader();
    loader();
    hack.cancel(url);
    await vi.runAllTimersAsync();
    loader();
    expect(retry).not.toHaveBeenCalled();
    expect(root.ResourceHandler._reloaders).toHaveLength(0);
    expect(root.SceneManager.resume).toHaveBeenCalledOnce();
    const audio = new root.WebAudio(url);
    audio.play();
    audio._load(url);
    expect(audio.played).not.toHaveBeenCalled();
    expect(audio.loaded).not.toHaveBeenCalled();
    expect(audio.isError()).toBe(false);
});

it('MZ clears the modal, resumes and prevents repeated image/audio load exceptions', () => {
    const { root, hack, printer } = fixture(true);
    const bitmap = new root.Bitmap('img/%E6%9C%AA.png');
    try {
        root.ImageManager.throwLoadError(bitmap);
    } catch (error) {
        root.SceneManager.catchLoadError(error);
    }
    expect(printer.children).toHaveLength(3);
    hack.cancel(bitmap.url);
    expect(bitmap.isReady()).toBe(true);
    expect(() => root.ImageManager.throwLoadError(bitmap)).not.toThrow();
    expect(printer.children).toHaveLength(0);
    expect(root.SceneManager.resume).toHaveBeenCalledOnce();
    const audio = new root.WebAudio('audio/missing.ogg');
    try {
        root.AudioManager.throwLoadError(audio);
    } catch (error) {
        root.SceneManager.catchLoadError(error);
    }
    hack.cancel(audio.url);
    expect(audio.stop).toHaveBeenCalledOnce();
    expect(() => root.AudioManager.throwLoadError(audio)).not.toThrow();
});
