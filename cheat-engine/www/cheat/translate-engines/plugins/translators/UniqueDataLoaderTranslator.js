import { isOriginalTextResourceRequired } from '../TextResourceTranslationContext.js';
import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { collectUniqueDataRows, normalizeUniqueText } from './UniqueDataCatalog.js';

/** UniqueDataLoader (MV/MZ): original JSON display fields use standard message,
 * message_portrait, choice and speaker entries. Resolve variable-backed display
 * text after native expansion. Never translate or mutate the loaded data tables.
 */
export class UniqueDataLoaderTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'UniqueDataLoader';
    }
    getCacheType() {
        return 'message';
    }
    collectRows(value) {
        collectUniqueDataRows(value, this.entries);
    }
    async precomputeCounts() {
        if (!this.scanPromise)
            this.scanPromise = this.loadSources().catch((error) => {
                this.scanPromise = null;
                throw error;
            });
        return this.scanPromise;
    }
    async loadSources() {
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        for (const encoded of parseJsonSafely(parameters.UniqueDataList, [])) {
            const row = parseJsonSafely(encoded, {});
            const filename = row.JsonFileName;
            if (
                typeof filename !== 'string' ||
                !/^[A-Za-z0-9_/-]+$/.test(filename) ||
                filename.includes('..')
            )
                throw new Error('Invalid UniqueDataLoader source filename');
            const response = await fetch(`data/${filename}.json`);
            if (!response.ok) throw new Error(`Cannot read UniqueDataLoader source: ${filename}`);
            const rows = parseJsonSafely(await response.text());
            if (!rows || typeof rows !== 'object')
                throw new Error(`Invalid UniqueDataLoader JSON: ${filename}`);
            this.collectRows(rows);
        }
    }
    getPendingSourceEntries() {
        return [...this.entries.values()];
    }
    getPendingItemCacheTypes(item) {
        return [item.type];
    }
    resolveText(text, runtime = this.getRuntime()) {
        if (!this.isUsableText(text) || !this.isRuntimeTranslationActive(runtime)) return text;
        const source = normalizeUniqueText(text).replace(/\n+$/, '');
        // Native choices can prefix the variable's caption with an icon.
        const prefix = source.match(/^(?:\\I\[\d+\])+/i)?.[0] || '';
        const caption = source.slice(prefix.length);
        for (const entry of this.entries.values()) {
            if (entry.value !== source && entry.value !== caption) continue;
            const translated = this.resolveRuntimeTranslation(entry.value, runtime, entry.type);
            if (translated === entry.value) continue;
            const display =
                entry.type === 'message' || entry.type === 'message_portrait'
                    ? runtime.wrapText(
                          runtime.cleanTranslatedText(translated),
                          entry.type === 'message_portrait'
                              ? runtime.maxLineWidthWithPortrait
                              : runtime.maxLineWidth
                      )
                    : translated;
            return (entry.value === caption ? prefix : '') + display;
        }
        return text;
    }
    enablePluginTranslation() {
        const message = window.Game_Message?.prototype;
        const base = window.Window_Base?.prototype;
        if (
            typeof message?.add !== 'function' ||
            typeof base?.convertEscapeCharacters !== 'function'
        )
            return false;
        const translator = this;
        const add = message.add;
        message.add = function (text) {
            const runtime = translator.getRuntime();
            // The same LF-only source goes to MT, Seen and the normal message pipeline.
            return add.call(
                this,
                translator.isRuntimeTranslationActive(runtime) ? normalizeUniqueText(text) : text
            );
        };
        const convert = base.convertEscapeCharacters;
        base.convertEscapeCharacters = function (text) {
            const runtime = translator.getRuntime();
            if (isOriginalTextResourceRequired() || !translator.isRuntimeTranslationActive(runtime))
                return convert.call(this, text);
            // Translate referenced display templates before their numeric/name
            // variables are expanded. Keep the actual variable values untouched.
            const prepared = translator
                .resolveText(text, runtime)
                .replace(/\\V\[(\d+)\]/gi, (token, id) => {
                    const value = window.$gameVariables.value(Number(id));
                    if (typeof value !== 'string') return token;
                    const translated = translator.resolveText(value, runtime);
                    return translated === value ? token : translated;
                });
            const converted = convert.call(this, prepared);
            const source = converted.split(String.fromCharCode(27)).join('\\');
            const translated = translator.resolveText(source, runtime);
            return translated === source ? converted : convert.call(this, translated);
        };
        this.precomputeCounts().catch((error) =>
            console.error('[UniqueDataLoader] Source scan failed', error)
        );
        return true;
    }
}
