import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** CharacterSelection (MZ): private mission selection scene with text windows. */
export class CharacterSelectionTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'CharacterSelection';
    }
    getPluginLabel() {
        return 'Character Selection';
    }
    getCacheType() {
        return 'plugin_character_selection';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts(parameters) {
        // Only these arrays are display text. Images, audio, and switch IDs
        // control selection behavior and must never enter the text catalog.
        for (const field of ['characterDescriptions', 'characterUnavailableDescriptions']) {
            const texts = parseJsonSafely(parameters?.[field], []);
            if (!Array.isArray(texts)) continue;
            for (const text of texts) if (this.isUsableText(text)) this.entries.set(text, { text });
        }
        this.entries.set('選択不可', { text: '選択不可' });
    }
}
