import { SourceTextCatalogTranslator } from './SourceTextCatalogTranslator.js';
import {
    extractJavaScriptTextCatalog,
    readJavaScriptLiteralData,
} from './translators/JavaScriptTextCatalog.js';
import { parseJsonSafely, walkNestedJsonLike } from './translators/TranslatorHelpers.js';

export class VisuMenuCatalogTranslator extends SourceTextCatalogTranslator {
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    getParameterPluginNames() {
        return [this.getPluginName()];
    }
    isTargetWindow(instance) {
        return this.getWindowNames().includes(instance.constructor.name);
    }
    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (!this.isUsableText(value) || parseJsonSafely(value, value) !== value) return;
            const field = path.at(-1);
            if (['DrawJS:func', 'TextJS:func'].includes(field)) {
                for (const entry of extractJavaScriptTextCatalog(value).entries)
                    this.entries.set(entry.text, entry);
            } else if (this.isDisplayField(field, path)) {
                this.entries.set(value, { text: value });
                if (value.includes('\n'))
                    for (const text of value.split('\n'))
                        if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        });
    }
    async collectAdditionalTexts() {
        const response = await fetch('js/plugins.js');
        if (!response.ok) throw new Error('Cannot read original VisuStella menu configuration');
        const { bindings } = readJavaScriptLiteralData(await response.text(), ['$plugins']);
        for (const plugin of bindings.$plugins || [])
            if (plugin?.status && this.getParameterPluginNames().includes(plugin.name))
                this.collectParameterTexts(plugin.parameters);
    }
    enablePluginTranslation() {
        const prototype = window.Window_Base?.prototype;
        if (
            typeof prototype?.drawText !== 'function' ||
            typeof prototype?.drawTextEx !== 'function'
        )
            return false;
        const translator = this;
        for (const name of ['drawText', 'drawTextEx', 'textWidth', 'textSizeEx']) {
            if (typeof prototype[name] !== 'function') continue;
            const original = prototype[name];
            prototype[name] = function (text, ...args) {
                if (translator.drawing || !translator.isTargetWindow(this))
                    return original.call(this, text, ...args);
                const translated = translator.resolveText(text, translator.getRuntime());
                translator.drawing++;
                try {
                    return original.call(this, translated, ...args);
                } finally {
                    translator.drawing--;
                }
            };
        }
        this.precomputeCounts().catch((error) =>
            console.error(`[${this.getPluginName()}] Menu catalog scan failed`, error)
        );
        return true;
    }
}
