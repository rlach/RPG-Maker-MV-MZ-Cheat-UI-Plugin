import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** MM_UltimateTextAnimation (MZ, unversioned). Translate whole text before glyph splitting and variable expansion. */
export class MMUltimateTextAnimationTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MM_UltimateTextAnimation';
    }
    getPluginLabel() {
        return 'MM Ultimate Text Animation';
    }
    getCacheType() {
        return 'plugin_mm_ultimate_text_animation';
    }
    collectSourceCatalog() {
        return { entries: [] };
    }
    collectMapTexts() {
        /* Map names belong to the standard database phase. */
    }
    collectCommandTexts(list = []) {
        for (const command of list || []) {
            const params = command.parameters;
            if (command.code === 357 && params[0]?.split('/').pop() === this.getPluginName())
                this.collectParameterTexts(params[3]);
        }
    }
    async collectAdditionalTexts() {
        const response = await fetch('dataMM/MMUA.json');
        if (!response.ok) throw new Error(`Cannot read MMUA presets: ${response.status}`);
        const presets = parseJsonSafely(await response.text());
        if (!presets) throw new Error('Invalid MMUA preset data');
        this.collectParameterTexts(presets);
    }
    enablePluginTranslation() {
        const proto = window.MM_AnimatedText?.AnimatedText?.prototype;
        if (typeof proto?.convertTextVariables !== 'function') return false;
        const original = proto.convertTextVariables;
        const translator = this;
        proto.convertTextVariables = function (text, ...args) {
            const runtime = translator.getRuntime();
            const translated = translator.isRuntimeTranslationActive(runtime)
                ? translator.resolveRuntimeTranslation(text, runtime)
                : text;
            return original.call(this, translated, ...args);
        };
        return true;
    }
}
