import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Manon_MenuVariable (MZ, unversioned). Translate the menu caption and unit
 * before drawing/measurement; variable IDs and values remain game-owned.
 */
export class ManonMenuVariableTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Manon_MenuVariable';
    }
    getCacheType() {
        return 'plugin_manon_menu_variable';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        for (const field of ['firstText', 'unitText']) {
            const text = parameters[field];
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_Base?.prototype;
        if (typeof prototype?.drawVariableValue !== 'function') return false;
        const original = prototype.drawVariableValue;
        const translator = this;
        prototype.drawVariableValue = function (label, value, unit, ...args) {
            const runtime = translator.getRuntime();
            const options = { requireRuntimeTranslationActive: true };
            label = translator.resolveRuntimeTranslation(
                label,
                runtime,
                translator.getCacheType(),
                options
            );
            unit = translator.resolveRuntimeTranslation(
                unit,
                runtime,
                translator.getCacheType(),
                options
            );
            return original.call(this, label, value, unit, ...args);
        };
        return true;
    }
}
