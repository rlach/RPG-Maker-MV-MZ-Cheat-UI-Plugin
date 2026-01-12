class MessageLogStore {
    constructor (maxEntries = 500) {
        this.maxEntries = maxEntries
        this.entries = []
        this.listeners = new Set()
        this.seq = 0
    }

    addEntry (text, meta = {}) {
        const normalized = (text || '').trim()
        if (!normalized) {
            return
        }

        const entry = Object.assign({
            id: ++this.seq,
            text: normalized,
            timestamp: Date.now(),
            translated: false,
            skipped: false
        }, meta)

        this.entries.push(entry)
        if (this.entries.length > this.maxEntries) {
            this.entries.shift()
        }

        this.notify()
    }

    clear () {
        this.entries = []
        this.notify()
    }

    subscribe (callback) {
        if (typeof callback !== 'function') {
            return () => {}
        }

        this.listeners.add(callback)
        callback(this.getEntries())

        return () => {
            this.listeners.delete(callback)
        }
    }

    getEntries () {
        return this.entries.slice()
    }

    notify () {
        for (const cb of this.listeners) {
            try {
                cb(this.getEntries())
            } catch (err) {
                console.warn('[MessageLogStore] Listener error', err)
            }
        }
    }
}
// Prefer the parent (main) window's log store so external windows see the same log
const __rootWindow = (window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed)
    ? window.opener
    : window

const __rootMessageLog = __rootWindow.__MESSAGE_LOG__ || new MessageLogStore()

// Persist on the root window and mirror locally for convenience
__rootWindow.__MESSAGE_LOG__ = __rootMessageLog
if (__rootWindow !== window) {
    window.__MESSAGE_LOG__ = __rootMessageLog
}

export const MESSAGE_LOG = __rootMessageLog
