import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';

export class CustomMadeStatusSceneTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'CustomMadeStatusScene';
    }
    getCacheType() {
        return 'plugin_custom_made_status';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const config = this.findPluginEntry(this.getPluginName())?.parameters?.ItemConfig;
        walkNestedJsonLike(config, (value, { path }) => {
            if (typeof value !== 'string' || !this.isUsableText(value)) return;
            const field = path.at(-1);
            if (
                field === 'label' ||
                field === 'default' ||
                (path.includes('values') && /^\d+$/.test(field))
            )
                this.entries.set(value, { text: value });
        });
    }
    enablePluginTranslation() {
        const prototype = window.Window_Status?.prototype;
        if (
            typeof prototype?.numberItemData !== 'function' ||
            typeof prototype?.stringItemData !== 'function'
        )
            return false;
        const translator = this;
        for (const method of ['numberItemData', 'stringItemData']) {
            const original = prototype[method];
            prototype[method] = function (...args) {
                const data = original.apply(this, args);
                const runtime = translator.getRuntime();
                if (!data || !translator.isRuntimeTranslationActive(runtime)) return data;
                const result = { ...data };
                for (const field of ['label', 'text']) {
                    if (field === 'label' && !args[0]?.label) continue;
                    if (translator.isUsableText(data[field]))
                        result[field] = translator.resolveRuntimeTranslation(
                            data[field],
                            runtime,
                            translator.getCacheType()
                        );
                }
                return result;
            };
        }
        return true;
    }
}
