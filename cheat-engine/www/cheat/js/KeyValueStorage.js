export class KeyValueStorage {
    constructor(filePath) {
        this.filePath = filePath
        this.fileEncoding = 'utf-8'
        this.fileSystem = require('fs')
        this.jsonIndent = 2
    }

    getAll() {
        return this.__readFile()
    }

    setAll(data) {
        this.__writeFileAtomicSync(data)
    }

    async setAllAsync(data) {
        await this.__writeFileAtomicAsync(data)
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
        await this.__writeFileAtomicAsync(data);
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
        this.__writeFileAtomicSync(data)
    }

    __writeFileAtomicSync(data) {
        const normalizedData = this.__normalizeFileData(data)
        this.fileSystem.writeFileSync(
            `${this.filePath}.tmp`,
            JSON.stringify(normalizedData, null, this.jsonIndent),
            this.fileEncoding
        )
        this.fileSystem.renameSync(`${this.filePath}.tmp`, this.filePath)
    }

    async __writeFileAtomicAsync(data) {
        const normalizedData = this.__normalizeFileData(data)
        await this.fileSystem.promises.writeFile(
            `${this.filePath}.tmp`,
            JSON.stringify(normalizedData, null, this.jsonIndent),
            this.fileEncoding
        )
        await this.fileSystem.promises.rename(`${this.filePath}.tmp`, this.filePath)
    }

    __normalizeFileData(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return {}
        }

        return data
    }
}

export const KEY_VALUE_STORAGE = new KeyValueStorage('./www/cheat-settings/kv-storage.json')
