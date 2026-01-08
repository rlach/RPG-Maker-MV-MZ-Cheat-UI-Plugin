// RPG MV API : https://kinoar.github.io/rmmv-doc-web/index.html

// import 'https://cdn.jsdelivr.net/npm/vue@2.x/dist/vue.js'
// import 'https://cdn.jsdelivr.net/npm/vuetify@2.x/dist/vuetify.js'

import '../libs/vue.js'
import '../libs/vuetify.js'

import MainComponent from '../MainComponent.js'
import TranslateOnTheFlyPanel from '../panels/TranslateOnTheFlyPanel.js'

// initialize vue
const vuetify = new Vuetify()

window.__VUETIFY_INSTANCE__ = vuetify

new Vue({
    vuetify,
    components: { MainComponent }
}).$mount('#app')

// Boot translation hook even if panel UI not opened
try {
    if (!window.__TranslateOnTheFlyPanel) {
        const HiddenTranslator = Vue.extend(TranslateOnTheFlyPanel)
        const mountPoint = document.createElement('div')
        new HiddenTranslator({ vuetify }).$mount(mountPoint) // mount off-DOM to avoid layout/scroll impact
        console.log('[TranslateOnTheFly] Hidden translator instance mounted off-DOM for auto-start')
    }
} catch (err) {
    console.warn('[TranslateOnTheFly] Failed to auto-mount translator', err)
}

// Override SceneManager to keep game active when cheat window (main or external) has focus
if (typeof SceneManager !== 'undefined' && !window.__CHEAT_EXTERNAL_WINDOW__) {
    SceneManager.isGameActive = function() {
        try {
            // Check if main game window has focus
            const mainWindowActive = window.document.hasFocus()
            
            // Check if external cheat window has focus
            let externalWindowActive = false
            const manager = window.__CHEAT_WINDOW_MANAGER__
            if (manager && manager.externalWindow) {
                try {
                    const extWin = manager.externalWindow
                    if (extWin && !extWin.closed) {
                        externalWindowActive = extWin.document.hasFocus()
                    }
                } catch (e) {
                    // Cross-origin or closed window - ignore
                }
            }
            
            return mainWindowActive || externalWindowActive
        } catch (e) {
            console.log('[Cheat] SceneManager.isGameActive override error, falling back to original', e)
            return true
        }
    }
    console.log('[Cheat] SceneManager.isGameActive override installed')
}