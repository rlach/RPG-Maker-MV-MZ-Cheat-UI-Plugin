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

export const MESSAGE_LOG = new MessageLogStore()
