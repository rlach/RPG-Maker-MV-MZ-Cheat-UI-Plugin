import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { createPositionalFormatCatalogEntry } from './TranslatorHelpers.js';

/** Gacha 1.8.3, KADOKAWA/triacontane (MV), RJ312010.
 * Collect display captions only. Item pools, costs and result logic stay native.
 */
export class GachaTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Gacha';
    }
    getPluginLabel() {
        return 'Gacha';
    }
    getCacheType() {
        return 'plugin_gacha';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts(parameters) {
        for (const key of [
            'Help Message Text',
            'Button Text',
            'Button Text 10 Time',
            'Button Text All',
            'Get Message Text',
            'New Item Notice',
            'Cost Unit',
        ]) {
            const text = parameters[key];
            if (this.isUsableText(text)) {
                const entry = createPositionalFormatCatalogEntry(
                    text.replace(/Required Amount|Item Name/g, '%1')
                );
                this.entries.set(entry.text, entry);
            }
        }
    }
}
