import {KeyValueStorage} from './KeyValueStorage.js'

const END_POINT_URL_PATTERN_TEXT_SYMBOL = '${TEXT}'
const DEFAULT_TRANSLATE_ENDPOINT_DATA = {
    method: 'get',
    urlPattern: `http://localhost:5000/translate?text=${END_POINT_URL_PATTERN_TEXT_SYMBOL}`,
    body: ''
}


class Translator {
    constructor (settings) {
        this.settings = settings
    }

    async isAvailable () {
        try {
            await this.__translate('test')
            return true
        } catch (e) {
            return false
        }

    }

    async __translate (text) {
        const epData = this.settings.getEndPointData()

        const realUrl = epData.urlPattern.replace(END_POINT_URL_PATTERN_TEXT_SYMBOL, encodeURI(text))

        if (epData.method === 'get') {
            return (await axios.get(realUrl)).data
        } else if (epData.method === 'post') {
            const body = epData.body ? epData.body : ''
            return (await axios.post(realUrl, body.replace(END_POINT_URL_PATTERN_TEXT_SYMBOL, text))).data
        }

        return text
    }

    async __translateBulk (texts) {
        return (await this.translate(texts.join('\n'))).split('\n')
    }

    async translate (text) {
        try {
            return (await this.__translate(text))
        } catch (err) {
            return text
        }
    }

    // async translateBulk (texts) {
    //     texts = texts.map(text => text.replace('\n', ''))
    //
    //     const chunkSize = 100
    //     const textsChunk = []
    //
    //     for (let i = 0; i < texts.length; i += chunkSize) {
    //         textsChunk.push(texts.slice(i, Math.min(texts.length, i + chunkSize)))
    //     }
    //
    //     const ret = [].concat(...await Promise.all(textsChunk.map(chunk => this.__translateBulk(chunk))))
    //     return ret
    // }

    async translateBulk (texts) {
        texts = texts.map(text => text.replace('\n', ''))

        const chunkSize = this.settings.getBulkTranslateChunkSize()
        const textsChunk = []

        for (let i = 0; i < texts.length; i += chunkSize) {
            textsChunk.push(await this.__translateBulk(texts.slice(i, Math.min(texts.length, i + chunkSize))))
        }

        return [].concat(...textsChunk)
    }
}


class TranslateSettings {
    constructor () {
        this.kvStorage = new KeyValueStorage('./www/cheat-settings/translate.json')
        this.__readSettings()
    }

    __readSettings () {
        const json = this.kvStorage.getItem('data')

        if (!json) {
            this.data = {
                enabled: false,
                endPointData: {...DEFAULT_TRANSLATE_ENDPOINT_DATA},

                targets: {
                    items: false,
                    variables: true,
                    switches: true,
                    maps: true,
                },

                bulkTranslateChunkSize: 500
            }
            return
        }

        this.data = JSON.parse(json)

        if (!this.data.endPointData || typeof this.data.endPointData !== 'object') {
            const legacyEndPointData = this.data.customEndPointData
            this.data.endPointData = {
                ...DEFAULT_TRANSLATE_ENDPOINT_DATA,
                ...(legacyEndPointData && typeof legacyEndPointData === 'object' ? legacyEndPointData : {})
            }
        }

        if (!Number.isFinite(this.data.bulkTranslateChunkSize) || this.data.bulkTranslateChunkSize <= 0) {
            this.data.bulkTranslateChunkSize = 500
        }

        if (!this.data.targets || typeof this.data.targets !== 'object') {
            this.data.targets = {
                items: false,
                variables: true,
                switches: true,
                maps: true,
            }
        }
    }

    __writeSettings () {
        this.kvStorage.setItem('data', JSON.stringify(this.data))
    }

    getEndPointData () {
        return this.data.endPointData
    }

    setEnabled (flag) {
        this.data.enabled = flag
        this.__writeSettings()
    }

    isEnabled () {
        return this.data.enabled
    }

    getBulkTranslateChunkSize() {
        return this.data.bulkTranslateChunkSize
    }

    getTargets () {
        return this.data.targets
    }

    setTargets (targets) {
        this.data.targets = targets
        this.__writeSettings()
    }

    isItemTranslateEnabled () {
        return this.isEnabled() && this.getTargets().items
    }

    isVariableTranslateEnabled () {
        return this.isEnabled() && this.getTargets().variables
    }

    isSwitchTranslateEnabled () {
        return this.isEnabled() && this.getTargets().switches
    }

    isMapTranslateEnabled () {
        return this.isEnabled() && this.getTargets().maps
    }
}

export const TRANSLATE_SETTINGS = new TranslateSettings()
export const TRANSLATOR = new Translator(TRANSLATE_SETTINGS)
