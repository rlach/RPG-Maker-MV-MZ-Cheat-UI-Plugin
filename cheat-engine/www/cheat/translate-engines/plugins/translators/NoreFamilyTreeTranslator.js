import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';

export class NoreFamilyTreeTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Nore_FamilyTree2';
    }
    getCacheType() {
        return 'plugin_nore_family_tree';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts() {}
    collectSourceCatalog(source) {
        const { bindings } = readJavaScriptLiteralData(source, ['TANEOYA_MAP']);
        const entries = new Map();
        for (const names of Object.values(bindings.TANEOYA_MAP || {})) {
            if (!Array.isArray(names)) continue;
            for (const text of [names[1], names[2] || names[1] + 'の子']) {
                if (this.isUsableText(text)) entries.set(text, { text });
            }
        }
        return { entries: [...entries.values()] };
    }
    enablePluginTranslation() {
        if (typeof window.getTaneoyaName !== 'function' || typeof window.getBabyName !== 'function')
            return false;
        const translator = this;
        for (const method of ['getTaneoyaName', 'getBabyName']) {
            const original = window[method];
            window[method] = function (...args) {
                return translator.resolveRuntimeTranslation(
                    original.apply(this, args),
                    translator.getRuntime(),
                    translator.getCacheType(),
                    { requireRuntimeTranslationActive: true }
                );
            };
        }
        return true;
    }
}
