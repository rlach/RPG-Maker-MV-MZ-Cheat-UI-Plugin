import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Standard MV ItemBook display labels; item fields use their existing caches. */
export class ItemBookTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'ItemBook';
    }
    getCacheType() {
        return 'plugin_item_book';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const params = this.findPluginEntry(this.getPluginName())?.parameters || {};
        for (const [field, fallback] of [
            ['Price Text', 'Price'],
            ['Equip Text', 'Equip'],
            ['Type Text', 'Type'],
            ['Unknown Data', '??????'],
        ]) {
            const text = params[field] || fallback;
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
}
