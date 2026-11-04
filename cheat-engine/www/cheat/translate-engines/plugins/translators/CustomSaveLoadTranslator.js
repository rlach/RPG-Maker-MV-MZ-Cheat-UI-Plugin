import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** CustomSaveLoad v1.0.8 (MV). Its private save window draws directly to a bitmap. */
export class CustomSaveLoadTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'CustomSaveLoad';
    }

    getPluginLabel() {
        return 'Custom Save Load';
    }

    getCacheType() {
        return 'plugin_custom_save_load';
    }

    collectSourceCatalog() {
        // Display text comes from parameters, not the plugin's implementation strings.
        return { entries: [] };
    }

    collectParameterTexts(parameters) {
        for (const line of (parameters.SaveVariableText || '').split('\\n')) {
            if (!line.trim()) continue;
            const parts = line.split(/<(?:time|map|[^<>]+)>/gi);
            const text = parts.reduce(
                (result, part, index) => result + (index ? `\\COT[${index - 1}]` : '') + part,
                ''
            );
            this.entries.set(text, parts.length > 1 ? { text, parts } : { text });
        }
    }
}
