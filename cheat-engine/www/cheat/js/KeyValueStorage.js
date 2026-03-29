export class KeyValueStorage {
    constructor(filePath) {
        this.filePath = filePath
        this.fileEncoding = 'utf-8'
        this.fileSystem = require('fs')
    }

    getItem(key) {
        return this.__getItemFromFile(key)
    }

    setItem(key, value) {
        this.__setItemToFile(key, value)
    }

    async setItemAsync(key, value) {
        const data = await this.__readFileAsync();

        data[key] = value;
        await this.fileSystem.promises.writeFile(`${this.filePath}.tmp`, JSON.stringify(data), this.fileEncoding);
        await this.fileSystem.promises.rename(`${this.filePath}.tmp`, this.filePath);
        console.log('[KeyValueStorage] Asynchronously wrote data to file', key);
    }

    __readFile() {
        if (!this.fileSystem.existsSync(this.filePath)) {
            return {}
        }

        return JSON.parse(this.fileSystem.readFileSync(this.filePath, this.fileEncoding))
    }

    async __readFileAsync() {
        if (!this.fileSystem.existsSync(this.filePath)) {
            return {}
        }
        const content = await this.fileSystem.promises.readFile(this.filePath, this.fileEncoding);
        return JSON.parse(content);
    }

    __getItemFromFile(key) {
        return this.__readFile()[key]
    }

    __setItemToFile(key, value) {
        const data = this.__readFile()

        data[key] = value

    console.log('[KeyValueStorage] Writing data to file', key, value);
        this.fileSystem.writeFileSync(this.filePath, JSON.stringify(data))
    }
}

export const KEY_VALUE_STORAGE = new KeyValueStorage('./www/cheat-settings/kv-storage.json')
