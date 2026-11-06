import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** YKNR_MessageKeyWord (MV, unversioned). Translate replacement values, never lookup keys. */
export class YknrMessageKeyWordTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'YKNR_MessageKeyWord';
    }
    getPluginLabel() {
        return 'YKNR Message Key Word';
    }
    getCacheType() {
        return 'plugin_yknr_message_key_word';
    }
    async buildCatalog() {
        this.keywords = new Map();
        const parameters = this.findPluginEntry(this.getPluginName()).parameters;
        for (const encoded of parseJsonSafely(parameters.KeyWordList, [])) {
            const entry = parseJsonSafely(encoded, encoded);
            if (!this.isUsableText(entry.Word)) continue;
            this.keywords.set(entry.Key, entry.Word);
            this.entries.set(entry.Word, { text: entry.Word });
        }
    }

    enablePluginTranslation() {
        const proto = window.Window_Base?.prototype;
        if (typeof proto?.convertEscapeCharacters !== 'function') return false;
        const original = proto.convertEscapeCharacters;
        const translator = this;
        proto.convertEscapeCharacters = function (text, ...args) {
            const runtime = translator.getRuntime();
            if (translator.isRuntimeTranslationActive(runtime))
                text = text.replace(/\\KW\[(.+?)\]/gi, (match, key) => {
                    const source = translator.keywords?.get(key);
                    return source === undefined
                        ? match
                        : translator.resolveRuntimeTranslation(source, runtime);
                });
            return original.call(this, text, ...args);
        };
        this.precomputeCounts();
        return true;
    }
}
