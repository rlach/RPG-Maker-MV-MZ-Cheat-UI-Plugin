import {KeyValueStorage} from './KeyValueStorage.js'

class CheatWindowManager {
    constructor () {
        this.storage = new KeyValueStorage('./www/cheat-settings/ui.json')
        this.useSeparateWindow = false
        this.externalWindow = null
        this.mainComponent = null
        this.lastComponent = null
        this.overlaySize = { width: 700, height: 400 }
        this.__load()
    }

    __load () {
        try {
            const json = this.storage.getItem('data')
            if (!json) {
                return
            }

            const data = JSON.parse(json)
            if (Object.prototype.hasOwnProperty.call(data, 'openInSeparateWindow')) {
                this.useSeparateWindow = !!data.openInSeparateWindow
            }

            if (data.overlaySize) {
                const { width, height } = data.overlaySize
                if (Number.isFinite(width) && Number.isFinite(height)) {
                    this.overlaySize = { width, height }
                }
            }
        } catch (err) {
            console.warn('[CheatWindowManager] Failed to load settings', err)
        }
    }

    __save () {
        try {
            const data = { 
                openInSeparateWindow: this.useSeparateWindow,
                overlaySize: this.overlaySize
            }
            this.storage.setItem('data', JSON.stringify(data))
        } catch (err) {
            console.warn('[CheatWindowManager] Failed to save settings', err)
        }
    }

    setMainComponent (component) {
        this.mainComponent = component
    }

    isSeparateWindowEnabled () {
        return !!this.useSeparateWindow
    }

    setSeparateWindowEnabled (flag) {
        this.useSeparateWindow = !!flag
        this.__save()

        if (!this.useSeparateWindow) {
            this.closeExternalWindow()
        }
    }

    setLastComponent (componentName) {
        if (componentName) {
            this.lastComponent = componentName
        }
    }

    setOverlaySize (width, height) {
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
            return
        }
        this.overlaySize = { width, height }
        this.__save()
    }

    getOverlaySize () {
        return { ...this.overlaySize }
    }

    openExternalWindow (componentName = null) {
        this.setLastComponent(componentName || this.lastComponent)

        if (this.lastComponent) {
            window.__CHEAT_DEFAULT_COMPONENT__ = this.lastComponent
        }

        if (this.externalWindow && !this.externalWindow.closed) {
            try {
                this.externalWindow.focus()
                return
            } catch (err) {
                // fall through to reopen
            }
        }

        const query = this.lastComponent ? `?component=${encodeURIComponent(this.lastComponent)}` : ''
        try {
            console.log('[CheatWindowManager] Opening external window with query:', query)
            nw.Window.open(`cheat/window.html${query}`, {}, (newWin) => {
                this.externalWindow = newWin;
                console.log('[CheatWindowManager] External window opened callback:', newWin);

                if (this.externalWindow) {
                this.externalWindow.__CHEAT_PARENT_WINDOW__ = window
                this.externalWindow.addEventListener('beforeunload', () => {
                    console.log('[CheatWindowManager] External window closing')
                    this.externalWindow = null
                })
                
                // Log when window loads
                this.externalWindow.addEventListener('load', () => {
                    console.log('[CheatWindowManager] External window loaded')
                })
                
                // Log any errors in external window to parent console
                this.externalWindow.addEventListener('error', (e) => {
                    console.error('[CheatWindowManager] Error in external window:', e)
                })
            } else {
                console.error('[CheatWindowManager] Failed to create external window')
            }
            })
        } catch (err) {
            console.error('[CheatWindowManager] Exception opening external window:', err)
        }
    }

    closeExternalWindow () {
        try {
            if (this.externalWindow && !this.externalWindow.closed) {
                this.externalWindow.close()
            }
        } catch (err) {
            console.warn('[CheatWindowManager] Failed to close external window', err)
        } finally {
            this.externalWindow = null
        }
    }

    toggleCheatUi (componentName = null) {
        if (!this.isSeparateWindowEnabled()) {
            if (this.mainComponent) {
                const prevComponentName = this.mainComponent.currentComponentName

                if (componentName) {
                    this.mainComponent.currentComponentName = componentName
                }

                if (this.mainComponent.show) {
                    if (!componentName || componentName === prevComponentName) {
                        this.mainComponent.show = false
                    }
                    return
                }

                this.mainComponent.show = true
            }
            return
        }

        this.setLastComponent(componentName)

        if (this.externalWindow && !this.externalWindow.closed) {
            this.closeExternalWindow()
        } else {
            this.openExternalWindow(componentName)
        }
    }

    openCheatUi (componentName = null) {
        if (!this.isSeparateWindowEnabled()) {
            if (this.mainComponent) {
                if (componentName) {
                    this.mainComponent.currentComponentName = componentName
                }
                this.mainComponent.show = true
            }
            return
        }

        this.openExternalWindow(componentName)
    }
}

export const CHEAT_WINDOW_MANAGER = new CheatWindowManager()

// Expose on window for cross-window access
window.__CHEAT_WINDOW_MANAGER__ = CHEAT_WINDOW_MANAGER
