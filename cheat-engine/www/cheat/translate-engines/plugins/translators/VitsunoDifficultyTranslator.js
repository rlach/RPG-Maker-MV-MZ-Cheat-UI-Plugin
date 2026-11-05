import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Vitsuno_Difficulty (MV). Translate option presentation without changing difficulty records. */
export class VitsunoDifficultyTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Vitsuno_Difficulty';
    }
    getCacheType() {
        return 'plugin_vitsuno_difficulty';
    }
    shouldScanEventData() {
        return false;
    }
    collectSourceCatalog() {
        return { entries: [] };
    }
    collectParameterTexts(parameters) {
        for (const [key, text] of Object.entries(parameters)) {
            if ((key === 'Option Name' || /^\d+ : Name$/.test(key)) && this.isUsableText(text))
                this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_Options?.prototype;
        if (
            typeof prototype?.statusText !== 'function' ||
            typeof prototype.addDifficultyOptions !== 'function'
        )
            return false;
        const translator = this;
        const statusText = prototype.statusText;
        prototype.statusText = function (index) {
            const text = statusText.call(this, index);
            return this.commandSymbol(index) === 'difficulty'
                ? translator.resolveText(text, translator.getRuntime())
                : text;
        };
        this.hookDrawing(prototype, 'addCommand');
        this.precomputeCounts().catch((error) =>
            console.error('[VitsunoDifficultyTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
