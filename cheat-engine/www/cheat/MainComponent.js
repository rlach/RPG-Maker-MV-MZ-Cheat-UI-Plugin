import CheatModal from './CheatModal.js'
import { GLOBAL_SHORTCUT } from "./js/GlobalShortcut.js"
import { GeneralCheat } from './js/CheatHelper.js'
import AlertSnackbar from './components/AlertSnackbar.js'
import ConfirmDialog from './components/ConfirmDialog.js'
import { customizeRPGMakerFunctions } from './init/customize_functions.js'
import {Key, UNASSIGNED_KEY_CODE} from './js/KeyCodes.js'
import {Alert} from'./js/AlertHelper.js'
import { CHEAT_WINDOW_MANAGER } from './js/CheatWindowManager.js'

export default {
    name: 'MainComponent',
    components: { CheatModal, AlertSnackbar, ConfirmDialog },
    template: `
<div 
    class="pa-2"
    ref="rootDiv">
    <v-fade-transition leave-absolute>
        <cheat-modal
            id="cheat-modal"
            class="opaque-on-mouseover"
            v-model="currentComponentName"
            v-if="show"
            >
        </cheat-modal>
    </v-fade-transition>
    <alert-snackbar></alert-snackbar>
    <confirm-dialog></confirm-dialog>
</div>`,

    style: `
    #cheat-modal: {
        opacity: 0.7;
    }
    `,

    data () {
        const defaultComponent = window.__CHEAT_DEFAULT_COMPONENT__ || null
        return {
            currentKey: Key.createEmpty(),
            show: false,
            currentComponentName: defaultComponent
        }
    },

    created () {
        const self = this

        customizeRPGMakerFunctions(self)

        CHEAT_WINDOW_MANAGER.setMainComponent(this)
        try {
            window.__CHEAT_MAIN_COMPONENT__ = this
        } catch (err) {
            // best-effort exposure for external window coordination
        }

        GeneralCheat.toggleCheatModal = (componentName = null) => {
            this.toggleCheatModal(componentName)
        }

        GeneralCheat.openCheatModal = (componentName = null) => {
            this.openCheatModal(componentName)
        }

        window.addEventListener('keydown', this.onGlobalKeyDown)
        window.addEventListener('keyup', this.onGlobalKeyUp)

        this.checkVersion()
    },

    beforeDestroy () {
        window.removeEventListener('keydown', this.onGlobalKeyDown)
        window.removeEventListener('keyup', this.onGlobalKeyUp)
    },

    watch: {
        show: {
            immediate: true,
            handler (value) {
            }
        }
    },

    methods: {
        isCombiningKeyCode (keyCode) {
            return keyCode === 16 || keyCode === 17 || keyCode === 18 || keyCode === 91 || keyCode === 93
        },

        resetStuckPrimaryWhenModifierPressed (keyCode) {
            if (!this.isCombiningKeyCode(keyCode)) {
                return
            }

            // If a non-modifier was left pressed when focus left, clear it before processing
            if (this.currentKey.code !== UNASSIGNED_KEY_CODE && !this.isCombiningKeyCode(this.currentKey.code)) {
                this.currentKey = Key.createEmpty()
            }
        },

        shouldIgnoreGlobalShortcut (e) {
            const target = e && e.target
            if (!target) {
                return false
            }

            const tag = target.tagName ? target.tagName.toLowerCase() : ''
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option') {
                return true
            }

            if (target.isContentEditable) {
                return true
            }

            const role = target.getAttribute && target.getAttribute('role')
            if (role === 'textbox') {
                return true
            }

            return false
        },

        onGlobalKeyDown (e) {
            this.resetStuckPrimaryWhenModifierPressed(e.keyCode)

            if (this.shouldIgnoreGlobalShortcut(e)) {
                return
            }

            if (e.repeat) {
                GLOBAL_SHORTCUT.runKeyRepeatEvent(e, Key.fromKey(this.currentKey))
            } else {
                GLOBAL_SHORTCUT.runKeyLeaveEvent(e, Key.fromKey(this.currentKey))
                this.currentKey.add(e.keyCode)
                this.currentKey.adjustCombiningKey(e)
                GLOBAL_SHORTCUT.runKeyEnterEvent(e, Key.fromKey(this.currentKey))
            }
        },

        onGlobalKeyUp (e) {
            if (this.shouldIgnoreGlobalShortcut(e)) {
                return
            }

            GLOBAL_SHORTCUT.runKeyLeaveEvent(e, Key.fromKey(this.currentKey))
            this.currentKey.remove(e.keyCode)
            // Don't run enter action if only modifier keys remain
            // Modifier key codes: Ctrl=17, Alt=18, Shift=16, Meta=91/93
            const remainingKey = Key.fromKey(this.currentKey)
            const isOnlyModifiers = remainingKey.code === 0 || 
                                   remainingKey.code === 16 || 
                                   remainingKey.code === 17 || 
                                   remainingKey.code === 18 ||
                                   remainingKey.code === 91 ||
                                   remainingKey.code === 93
            if (!isOnlyModifiers && !remainingKey.isEmpty()) {
                GLOBAL_SHORTCUT.runKeyEnterEvent(e, remainingKey)
            }
        },

        openCheatModal (componentName) {
            console.log('[MainComponent] openCheatModal called, separateWindow?', CHEAT_WINDOW_MANAGER.isSeparateWindowEnabled())
            if (CHEAT_WINDOW_MANAGER.isSeparateWindowEnabled()) {
                // Do NOT show overlay - use external window instead
                console.log('[MainComponent] Using external window')
                this.show = false
                CHEAT_WINDOW_MANAGER.openCheatUi(componentName || this.currentComponentName)
                return
            }

            // Overlay mode
            console.log('[MainComponent] Using overlay mode')
            if (componentName) {
                this.currentComponentName = componentName
            }
            this.show = true
        },

        toggleCheatModal (componentName) {
            console.log('[MainComponent] toggleCheatModal called, separateWindow?', CHEAT_WINDOW_MANAGER.isSeparateWindowEnabled())
            if (CHEAT_WINDOW_MANAGER.isSeparateWindowEnabled()) {
                // Use external window - ensure overlay is closed
                console.log('[MainComponent] Toggling external window')
                this.show = false
                CHEAT_WINDOW_MANAGER.toggleCheatUi(componentName || this.currentComponentName)
                return
            }

            // Overlay mode
            const prevComponentName = this.currentComponentName

            if (componentName) {
                this.currentComponentName = componentName
            }

            if (this.show) {
                if (!componentName || componentName === prevComponentName) {
                    this.show = false
                }
                return
            }

            this.show = true
        },

        async checkVersion () {
            if (!Utils?.isNwjs()) {
                return
            }

            try {
                const releaseInfo = (await axios.get('https://api.github.com/repos/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin/releases/latest')).data

                const currentCheatVersion = this.getCurrentCheatVersion()

                if (!currentCheatVersion) {
                    return
                }

                if (currentCheatVersion < releaseInfo.tag_name) {
                    Alert.warn(`New cheat version has been released : ${currentCheatVersion} → ${releaseInfo.tag_name}`, null, 3000)
                }
            } catch (err) {

            }
        },

        getCurrentCheatVersion () {
            try {
                const targetDir = Utils.RPGMAKER_NAME === 'MV' ? 'www' : '.'

                const description = JSON.parse(require('fs').readFileSync(targetDir + '/cheat-version-description.json', 'utf-8'))

                return description.version
            } catch (err) {
                return null
            }
        }
    }
}
