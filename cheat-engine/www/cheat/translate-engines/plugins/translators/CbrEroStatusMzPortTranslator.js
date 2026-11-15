import { DisplayVariableCatalogTranslator } from '../DisplayVariableCatalogTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';
import { isRpgMakerMv } from '../../../js/RpgMakerRuntime.js';

export class CbrEroStatusMzPortTranslator extends DisplayVariableCatalogTranslator {
    getPluginName() {
        return 'CBR_eroStatus_main_MZ';
    }
    getPluginAliases() {
        return ['CBR_eroStatus_main'];
    }
    getCacheType() {
        return 'plugin_cbr_erostatus_mz_port';
    }
    getSourcePluginNames() {
        return [];
    }
    detectPlugin() {
        return !isRpgMakerMv() && super.detectPlugin();
    }
    collectMapTexts() {}
    collectCommandTexts(list = []) {
        for (const command of list || [])
            if (command.code === 122) this.assignments.push(command.parameters);
    }
    async collectAdditionalTexts() {
        for (const plugin of window.$plugins || []) {
            if (!plugin.status || !/^CBR_eroStatus_\d+$/i.test(plugin.name)) continue;
            walkNestedJsonLike(plugin.parameters, (value, { path }) => {
                if (typeof value !== 'string' || !/^txtSubject_\d+$/.test(path.at(-1))) return;
                this.collectDisplayReferences(value);
                if (this.isUsableText(value.replace(/\\[a-z]+\[(?:\\+v\[\d+\]|\d+)\]/gi, '')))
                    this.entries.set(value, { text: value });
            });
        }
        await this.collectVariableTexts();
    }
    enablePluginTranslation() {
        const prototype = window.Window_EroStatus?.prototype;
        if (
            typeof prototype?.drawTextEx !== 'function' ||
            typeof prototype?.convertEscapeCharacters !== 'function'
        )
            return false;
        for (const method of ['drawTextEx', 'textSizeEx'])
            if (typeof prototype[method] === 'function') this.hookDrawing(prototype, method);
        const original = prototype.convertEscapeCharacters;
        const translator = this;
        prototype.convertEscapeCharacters = function (...args) {
            return translator.resolveText(original.apply(this, args), translator.getRuntime());
        };
        this.precomputeCounts().catch((error) =>
            console.error('[CBR MZ port] Catalog scan failed', error)
        );
        return true;
    }
}
