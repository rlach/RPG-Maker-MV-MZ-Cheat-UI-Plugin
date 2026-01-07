// RPG MV API : https://kinoar.github.io/rmmv-doc-web/index.html

// import 'https://cdn.jsdelivr.net/npm/vue@2.x/dist/vue.js'
// import 'https://cdn.jsdelivr.net/npm/vuetify@2.x/dist/vuetify.js'

import '../libs/vue.js'
import '../libs/vuetify.js'

import MainComponent from '../MainComponent.js'
import TranslateOnTheFlyPanel from '../panels/TranslateOnTheFlyPanel.js'

// initialize vue
const vuetify = new Vuetify()

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
