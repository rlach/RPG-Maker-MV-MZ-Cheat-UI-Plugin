import { isOriginalTextResourceRequired } from '../TextResourceTranslationContext.js';
import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * TextResource v0.0.2 (MZ, Panzer-IV). Catalogs complete resource strings under
 * the standard message namespace, including current-language overrides and fallback.
 * UI resolves before custom wrapping; ADV dialogue keeps original source text for
 * the standard message pipeline. Labels and dictionary values are never rewritten.
 */
export class TextResourceTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TextResource';
    }

    getCacheType() {
        return 'message';
    }

    async buildCatalog() {
        const resource = window.TextResource;
        await new Promise((resolve) => resource.addOnLoadedListener(resolve));
        const { resources, baseLanguage, language } = resource.textLabels;
        const table = { ...resources[baseLanguage], ...resources[language] };
        for (const text of Object.values(table)) {
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }

    enablePluginTranslation() {
        const resource = window.TextResource;
        if (
            typeof resource?.addOnLoadedListener !== 'function' ||
            typeof resource?.getText !== 'function'
        )
            return false;
        const original = resource.getText;
        const translator = this;
        resource.getText = function (...args) {
            const source = original.apply(this, args);
            if (isOriginalTextResourceRequired()) return source;
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime)) return source;
            return translator.resolveRuntimeTranslation(source, runtime);
        };
        return true;
    }
}
