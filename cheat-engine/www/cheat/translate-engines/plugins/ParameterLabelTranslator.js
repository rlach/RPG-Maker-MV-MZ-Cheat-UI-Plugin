import { SourceTextCatalogTranslator } from './SourceTextCatalogTranslator.js';

/** Localize exact parameter labels only at the presentation boundary. */
export class ParameterLabelTranslator extends SourceTextCatalogTranslator {
    shouldScanEventData() {
        return false;
    }
    collectSourceCatalog() {
        return { entries: [] };
    }
    collectParameterTexts(parameters) {
        for (const field of this.getTextFields()) {
            const text = parameters[field];
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const base = window.Window_Base?.prototype;
        if (typeof base?.drawText !== 'function') return false;
        if (this.getOptionSymbol()) {
            const options = window.Window_Options?.prototype;
            if (typeof options?.statusText !== 'function') return false;
            const statusText = options.statusText;
            const translator = this;
            options.statusText = function (index) {
                const text = statusText.call(this, index);
                return this.commandSymbol(index) === translator.getOptionSymbol()
                    ? translator.resolveText(text, translator.getRuntime())
                    : text;
            };
        }
        this.hookDrawing(base, 'drawText');
        this.precomputeCounts().catch((error) =>
            console.error(`[${this.getPluginName()}] Catalog scan failed`, error)
        );
        return true;
    }
    getOptionSymbol() {
        return null;
    }
}
