export class KeyValueStorage {
    constructor (filePath) {
            this.filePath = filePath
            this.fileEncoding = 'utf-8'
            this.fileSystem = require('fs')
    }

    getItem (key) {
        return this.__getItemFromFile(key)
    }

    setItem (key, value) {
        this.__setItemToFile(key, value)
    }

    setBatch (items) {
        if (!items || typeof items !== 'object') {
            return
        }

        const data = this.__readFile()
        for (const [key, value] of Object.entries(items)) {
            data[key] = value
        }

        console.log('[KeyValueStorage] Writing batch data to file', Object.keys(items).length, 'entries')
        this.fileSystem.writeFileSync(this.filePath, JSON.stringify(data))
    }

    __readFile () {
        if (!this.fileSystem.existsSync(this.filePath)) {
            return {}
        }

        return JSON.parse(this.fileSystem.readFileSync(this.filePath, this.fileEncoding))
    }

    __getItemFromFile (key) {
        return this.__readFile()[key]
    }

    __setItemToFile (key, value) {
        const data = this.__readFile()

        data[key] = value

        console.log('[KeyValueStorage] Writing data to file', key, value);
        this.fileSystem.writeFileSync(this.filePath, JSON.stringify(data))
    }
}

export const KEY_VALUE_STORAGE = new KeyValueStorage('./www/cheat-settings/kv-storage.json')
