import { SourceTextCatalogTranslator } from './SourceTextCatalogTranslator.js';
import {
    parseJsonSafely,
    walkNestedJsonLike,
    createPositionalFormatCatalogEntry,
} from './translators/TranslatorHelpers.js';

/** Shared parameter extraction for independently detected public MZ plugins. */
export class ParameterSourceCatalogTranslator extends SourceTextCatalogTranslator {
    getCatalogCacheTypes() {
        // Preserve translations previously stored by the Celia aggregate translator.
        return [this.getCacheType(), 'plugin_celia_dungeon_ui'];
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts(parameters) {
        super.collectParameterTexts(parameters);
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (
                typeof value !== 'string' ||
                parseJsonSafely(value, value) !== value ||
                !this.getParameterTextPattern().test(path.join('/'))
            )
                return;
            const entry = createPositionalFormatCatalogEntry(value);
            if (this.isUsableText(entry.text)) this.entries.set(entry.text, entry);
        });
    }
}
