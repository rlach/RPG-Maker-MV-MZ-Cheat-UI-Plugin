import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';

export class TaSceneStatusExtendTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TA_SceneStatusExtendMZ';
    }
    getCacheType() {
        return 'plugin_ta_scene_status_extend';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    collectAdditionalTexts() {
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        const pages = new Set();
        const add = (text) => {
            if (this.isUsableText(text)) this.entries.set(text, { text });
        };
        walkNestedJsonLike(parameters.PageSelectWindowList, (value) => {
            if (value && typeof value === 'object' && typeof value.PageContents === 'string') {
                pages.add(value.PageContents);
                add(value.PageName);
            }
        });
        const fields = {
            Exp: ['ExpHeader'],
            Param: ['ParametersHeader'],
            ExParam: ['ExParametersHeader', 'ExParametersList'],
            SpParam: ['SpParametersHeader', 'SpParametersList'],
            CustomParam: ['CustomParamsHeader'],
            StateResist: ['StateResistHeader'],
            ElementResist: ['ElementResistHeader'],
            Resists: ['StateResistHeader', 'ElementResistHeader'],
            Equips: ['EquipmentsHeader'],
            Profile: ['ProfileHeader'],
        };
        for (const page of pages)
            for (const field of fields[page] || []) {
                if (field.endsWith('Header')) add(parameters[field]);
                else
                    walkNestedJsonLike(parameters[field], (value, { path }) => {
                        if (['ExParamName', 'SpParamName'].includes(path.at(-1))) add(value);
                    });
            }
    }
    enablePluginTranslation() {
        const prototype = window.Window_Base?.prototype;
        if (typeof prototype?.drawText !== 'function') return false;
        this.collectAdditionalTexts();
        const original = prototype.drawText;
        const translator = this;
        prototype.drawText = function (text, ...args) {
            if (
                ['Window_StatusDetail', 'Window_STList'].includes(this.constructor.name) &&
                translator.entries.has(text)
            )
                text = translator.resolveRuntimeTranslation(
                    text,
                    translator.getRuntime(),
                    translator.getCacheType(),
                    { requireRuntimeTranslationActive: true }
                );
            return original.call(this, text, ...args);
        };
        return true;
    }
}
