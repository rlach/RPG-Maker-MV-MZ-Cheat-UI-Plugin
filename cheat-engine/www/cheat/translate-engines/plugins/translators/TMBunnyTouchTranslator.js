import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely, createPositionalFormatCatalogEntry } from './TranslatorHelpers.js';

/** TMBunnyTouch 1.1.0 (MV), RJ312010.
 * Display-only support for normal/calculation modes, instructions, timers and
 * result templates. Scores, penalty values and result variables stay untouched.
 */
export class TMBunnyTouchTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TMBunnyTouch';
    }
    getPluginLabel() {
        return 'TM Bunny Touch';
    }
    getCacheType() {
        return 'plugin_tm_bunny_touch';
    }
    shouldScanEventData() {
        return false;
    }

    collectParameterTexts(parameters) {
        const texts = [parameters.stateText, parameters.giveupText];
        for (const key of ['helpTexts', 'helpCalcTexts']) {
            const values = parseJsonSafely(parameters[key], {});
            texts.push(...Object.values(values || {}));
        }
        for (const value of texts) {
            if (!this.isUsableText(value)) continue;
            const text = value.replace(/\\n/g, '\n');
            const entry = createPositionalFormatCatalogEntry(text);
            this.entries.set(entry.text, entry);
        }
    }
}
