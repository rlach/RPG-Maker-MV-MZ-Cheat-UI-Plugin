// RPG MV API : https://kinoar.github.io/rmmv-doc-web/index.html

import '../libs/vue.js';
import '../libs/vuetify.js';

import MainComponent from '../MainComponent.js';
import { ensureTranslationRuntime } from '../panels/translate-on-the-fly/TranslationRuntime.js';
import { PLUGIN_TRANSLATOR_REGISTRY } from '../translate-engines/plugins/PluginTranslatorRegistry.js';
import { ensureHacksRuntime } from '../js/HacksRuntime.js';

// initialize vue
const vuetify = new Vuetify();

window.__VUETIFY_INSTANCE__ = vuetify;

new Vue({
    vuetify,
    components: { MainComponent },
}).$mount('#app');

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

// Boot translation runtime even if settings panel UI is never opened.
ensureTranslateOnTheFlyRuntime();
ensureHacksRuntime();

setTimeout(() => {
    const runtime = ensureTranslateOnTheFlyRuntime();
    PLUGIN_TRANSLATOR_REGISTRY.ensureDetectionStarted({ runtime });
}, 2000);

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
