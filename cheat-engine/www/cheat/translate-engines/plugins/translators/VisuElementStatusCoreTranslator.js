import { VisuMenuCatalogTranslator } from '../VisuMenuCatalogTranslator.js';

export class VisuElementStatusCoreTranslator extends VisuMenuCatalogTranslator {
    getPluginName() {
        return 'VisuMZ_1_ElementStatusCore';
    }
    getCacheType() {
        return 'plugin_visu_element_status_core';
    }
    isTargetWindow(instance) {
        return (
            instance instanceof window.Window_StatusData ||
            instance instanceof window.Window_StatusCategory
        );
    }
    enablePluginTranslation() {
        if (
            typeof window.Window_StatusData !== 'function' ||
            typeof window.Window_StatusCategory !== 'function'
        )
            return false;
        return super.enablePluginTranslation();
    }
    getParameterPluginNames() {
        return [this.getPluginName(), 'VisuMZ_0_CoreEngine'];
    }
    isDisplayField(field) {
        return (
            /^(?:Text|Label|Display|Vocab\w+|[XS]ParamVocab\d+):str$/.test(field) ||
            field === 'Description:json'
        );
    }
    async collectAdditionalTexts() {
        await super.collectAdditionalTexts();
        const response = await fetch('data/Actors.json');
        if (!response.ok) throw new Error('Cannot read original actor biographies');
        for (const actor of await response.json()) {
            for (const match of (actor?.note || '').matchAll(
                /<Biography>([\s\S]*?)<\/Biography>/gi
            )) {
                const text = match[1].trim();
                if (this.isUsableText(text)) {
                    this.entries.set(text, { text });
                    for (const line of text.split('\n'))
                        if (this.isUsableText(line)) this.entries.set(line, { text: line });
                }
            }
        }
    }
}
