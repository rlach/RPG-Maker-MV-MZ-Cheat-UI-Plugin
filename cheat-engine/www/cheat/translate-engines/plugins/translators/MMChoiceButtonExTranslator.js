import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** MM_ChoiceButtonEx v1.0.0 (MZ). Preset labels and command overrides, before button layout. */
export class MMChoiceButtonExTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MM_ChoiceButtonEx';
    }
    getPluginLabel() {
        return 'MM Choice Button Ex';
    }
    getCacheType() {
        return 'plugin_mm_choice_button_ex';
    }

    collectSourceCatalog() {
        return { entries: [] };
    }
    collectMapTexts() {
        /* Standard map translation owns map names. */
    }

    collectCommandTexts(list = []) {
        for (const command of list || []) {
            const args = command.parameters;
            if (
                command.code === 357 &&
                args[0]?.split('/').pop() === this.getPluginName() &&
                ['showChoicePreset', 'showButtonPanelPreset'].includes(args[1])
            ) {
                this.collectParameterTexts(args[3]);
            }
        }
    }

    async collectAdditionalTexts() {
        const path =
            this.findPluginEntry().parameters.presetDataFile ||
            'dataMM/MMChoiceButtonExPresets.json';
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Cannot read ${path}: ${response.status}`);
        const data = parseJsonSafely(await response.text());
        if (!data) throw new Error(`Invalid choice preset data: ${path}`);
        this.collectParameterTexts(data);
    }

    enablePluginTranslation() {
        const manager = window.MMChoiceButtonEx?.Manager;
        if (typeof manager?.showChoice !== 'function' || typeof manager?.showPanel !== 'function')
            return false;
        const translator = this;
        for (const method of ['showChoice', 'showPanel']) {
            const original = manager[method];
            manager[method] = function (config, ...args) {
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime))
                    return original.call(this, config, ...args);
                const choices = config.choices.map((choice) => ({
                    ...choice,
                    text: translator.resolveRuntimeTranslation(choice.text, runtime),
                }));
                return original.call(this, { ...config, choices }, ...args);
            };
        }
        return true;
    }
}
