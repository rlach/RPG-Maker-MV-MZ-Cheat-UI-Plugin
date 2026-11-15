import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

export class SoRMapActionIndicatorTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'SoR_MapActionIndicator_MZ_Beta';
    }
    getCacheType() {
        return 'plugin_sor_map_action_indicator';
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    collectCommandTexts(list = []) {
        for (const command of list || []) {
            if (![108, 408].includes(command.code)) continue;
            const match = /<ActionIndicator:[ ]*(.*)[ ]*>/i.exec(String(command.parameters[0]));
            if (!match) continue;
            const text = match[1]
                .replace(/\\/g, '\x1b')
                .replaceAll('\x1b\x1b', '\\')
                .replace(new RegExp(String.fromCharCode(27) + 'i\\[(\\d+)\\]', 'gi'), '')
                .replace(new RegExp(String.fromCharCode(27) + 'k\\[(.*)\\]', 'gi'), '');
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    async collectAdditionalTexts() {
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        for (const field of ['VehicleOn_text', 'VehicleOff_text']) {
            const text = parameters[field];
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const prototype = window.Game_Player?.prototype;
        if (typeof prototype?.CheckEnableActions !== 'function') return false;
        const original = prototype.CheckEnableActions;
        const translator = this;
        prototype.CheckEnableActions = function (...args) {
            const tag = original.apply(this, args);
            const runtime = translator.getRuntime();
            if (!tag || !translator.isRuntimeTranslationActive(runtime)) return tag;
            return {
                ...tag,
                text: translator.resolveRuntimeTranslation(
                    tag.text,
                    runtime,
                    translator.getCacheType()
                ),
            };
        };
        return true;
    }
}
