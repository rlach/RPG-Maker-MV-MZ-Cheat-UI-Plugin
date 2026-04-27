// RPG MV API : https://kinoar.github.io/rmmv-doc-web/index.html

import '../libs/vue.js';
import '../libs/vuetify.js';

import MainComponent from '../MainComponent.js';
import { ensureTranslationRuntime } from '../panels/translate-on-the-fly/TranslationRuntime.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../translate-engines/plugins/PluginTranslatorRegistry.js';
import { ensureHacksRuntime } from '../js/HacksRuntime.js';
import { getRpgMakerName } from '../js/RpgMakerRuntime.js';

function getMissingBootstrapDependencies() {
    const missing = [];

    if (!globalThis?.Utils || typeof globalThis.Utils.isNwjs !== 'function') {
        missing.push('Utils.isNwjs');
    }

    const makerName = getRpgMakerName();
    if (!makerName) {
        missing.push('Utils.RPGMAKER_NAME');
    }

    if (typeof globalThis.Window_Message === 'undefined') {
        missing.push('Window_Message');
    }

    if (typeof globalThis.Game_Message === 'undefined') {
        missing.push('Game_Message');
    }

    if (
        typeof globalThis.TouchInput === 'undefined' ||
        typeof globalThis.TouchInput._onWheel !== 'function' ||
        typeof globalThis.TouchInput._onMouseDown !== 'function'
    ) {
        missing.push('TouchInput._onWheel/_onMouseDown');
    }

    return missing;
}

function ensureEveryDependencyReadyWithRetry(options = {}) {
    const delayMs = Number(options.delayMs) > 0 ? Number(options.delayMs) : 250;
    const logEvery = Number(options.logEvery) > 0 ? Number(options.logEvery) : 8;

    let attempt = 0;

    return new Promise((resolve) => {
        const tryEnsure = () => {
            attempt += 1;

            const missing = getMissingBootstrapDependencies();
            if (missing.length === 0) {
                console.log(`[Cheat] Bootstrap dependencies ready (attempt ${attempt})`);
                resolve(true);
                return;
            }

            if (attempt === 1 || attempt % logEvery === 0) {
                console.warn(
                    `[Cheat] Waiting for bootstrap dependencies (attempt ${attempt}): ${missing.join(', ')}`
                );
            }

            setTimeout(tryEnsure, delayMs);
        };

        tryEnsure();
    });
}

window.__ensureEveryDependencyReadyWithRetry = ensureEveryDependencyReadyWithRetry;

function ensureTranslateOnTheFlyRuntime() {
    try {
        return ensureTranslationRuntime();
    } catch (err) {
        console.warn('[TranslateOnTheFly] Failed to ensure runtime translator', err);
        return null;
    }
}

window.__ensureTranslateOnTheFlyRuntime = ensureTranslateOnTheFlyRuntime;
window.__ensureTranslationRuntime = ensureTranslateOnTheFlyRuntime;

function ensureTranslateOnTheFlyRuntimeWithRetry(options = {}) {
    const maxAttempts = Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : 20;
    const delayMs = Number(options.delayMs) > 0 ? Number(options.delayMs) : 500;

    let attempt = 0;
    const tryEnsure = () => {
        attempt += 1;
        const runtime = ensureTranslateOnTheFlyRuntime();
        if (runtime) {
            console.log(`[TranslateOnTheFly] Runtime bootstrap ready (attempt ${attempt})`);
            return runtime;
        }

        if (attempt >= maxAttempts) {
            console.warn(
                `[TranslateOnTheFly] Runtime bootstrap failed after ${attempt} attempts`
            );
            return null;
        }

        setTimeout(tryEnsure, delayMs);
        return null;
    };

    return tryEnsure();
}

async function bootstrapCheatUi() {
    await ensureEveryDependencyReadyWithRetry({ delayMs: 250, logEvery: 8 });

    // initialize vue
    const vuetify = new Vuetify();

    window.__VUETIFY_INSTANCE__ = vuetify;

    new Vue({
        vuetify,
        components: { MainComponent },
    }).$mount('#app');

    // Boot translation runtime even if settings panel UI is never opened.
    ensureTranslateOnTheFlyRuntimeWithRetry({ maxAttempts: 30, delayMs: 500 });
    ensureHacksRuntime();

    setTimeout(() => {
        const runtime = ensureTranslateOnTheFlyRuntimeWithRetry({ maxAttempts: 10, delayMs: 500 });
        PLUGIN_TRANSLATOR_REGISTRY.ensureDetectionStarted({ runtime });
    }, 2000);
}

bootstrapCheatUi();

// Override SceneManager to keep game active when cheat window (main or external) has focus
if (typeof SceneManager !== 'undefined' && !window.__CHEAT_EXTERNAL_WINDOW__) {
    SceneManager.isGameActive = function () {
        try {
            // Check if main game window has focus
            const mainWindowActive = window.document.hasFocus();

            // Check if external cheat window has focus
            let externalWindowActive = false;
            const manager = window.__CHEAT_WINDOW_MANAGER__;
            if (manager && manager.externalWindow) {
                try {
                    const extWin = manager.externalWindow;
                    if (extWin && !extWin.closed) {
                        const extDomWindow = extWin.window || extWin;
                        if (
                            extDomWindow &&
                            extDomWindow.document &&
                            typeof extDomWindow.document.hasFocus === 'function'
                        ) {
                            externalWindowActive = extDomWindow.document.hasFocus();
                        }
                    }
                } catch (e) {
                    // Cross-origin or closed window - ignore
                }
            }

            return mainWindowActive || externalWindowActive;
        } catch (e) {
            console.log(
                '[Cheat] SceneManager.isGameActive override error, falling back to original',
                e
            );
            return true;
        }
    };
    console.log('[Cheat] SceneManager.isGameActive override installed');
}
