import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';

export class TorigoyaMZBookshelfTranslator extends SourceTextCatalogTranslator {
    constructor() {
        super();
        this.files = new Set();
    }
    getPluginName() {
        return 'TorigoyaMZ_Bookshelf';
    }
    getCacheType() {
        return 'plugin_torigoya_bookshelf';
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    collectCommandTexts(list = []) {
        for (const command of list || []) {
            const p = command.parameters;
            if (command.code === 357 && p[0] === this.getPluginName() && p[1] === 'openBookshelf')
                this.addFile(p[3]?.fileName);
        }
    }
    addFile(value) {
        if (typeof value === 'string' && value.trim() && !value.includes('\\'))
            this.files.add(value.trim());
    }
    async collectAdditionalTexts() {
        walkNestedJsonLike(
            this.findPluginEntry(this.getPluginName())?.parameters,
            (value, { path }) => {
                if (path.at(-1) === 'fileName') this.addFile(value);
            }
        );
        const parser = new window.Torigoya.Bookshelf.TextParser();
        for (const file of this.files) {
            const url = `bookshelf/${file}${/\.[^./]+$/.test(file) ? '' : '.txt'}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Cannot read ${url}: ${response.status}`);
            const shelf = parser.parse(await response.text());
            for (const text of [
                shelf.title,
                ...shelf.books.flatMap((book) => [book.title, ...book.pages]),
            ])
                if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const base = window.Window_Base?.prototype;
        if (typeof base?.drawTextEx !== 'function' || !window.Torigoya?.Bookshelf?.TextParser)
            return false;
        const translator = this;
        for (const method of ['drawText', 'drawTextEx', 'textSizeEx', 'textWidth']) {
            const original = base[method];
            if (typeof original !== 'function') continue;
            base[method] = function (text, ...args) {
                if (/^Window_(?:BookshelfTitle|BooksList|BookContent)$/.test(this.constructor.name))
                    text = translator.resolveRuntimeTranslation(
                        text,
                        translator.getRuntime(),
                        translator.getCacheType(),
                        { requireRuntimeTranslationActive: true }
                    );
                return original.call(this, text, ...args);
            };
        }
        return true;
    }
}
