import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * 111_InputFormMZ translator
 *
 * Supported versions:
 * - 111_InputFormMZ v1.0.1 (MZ, Sasuke KANNAZUKI)
 *
 * Translation notes:
 * - Collects the OK and Cancel HTML button labels from plugin parameters
 *   ('OK Button Text', 'Cancel Button Text').
 * - Hooks Game_Interpreter.prototype._performInput so that after the plugin appends
 *   its <input type="submit" id="_111_submit"> buttons to document.body, matching
 *   button values are translated at presentation without mutating plugin parameters
 *   or touching the player's text input value.
 */

const CACHE_TYPE = 'plugin_111_input_form_mz';
const BUTTON_PARAM_KEYS = ['OK Button Text', 'Cancel Button Text'];
const SUBMIT_BUTTON_SELECTOR = 'input[id="_111_submit"][type="submit"]';

export class InputFormMzTranslator extends BasePluginTranslator {
    getPluginName() {
        return '111_InputFormMZ';
    }

    getPluginLabel() {
        return '111 InputFormMZ';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    getConfiguredButtonLabels() {
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters;
        if (!parameters || typeof parameters !== 'object') {
            return [];
        }

        const labels = [];
        const seen = new Set();
        for (const key of BUTTON_PARAM_KEYS) {
            const value = typeof parameters[key] === 'string' ? parameters[key] : '';
            if (this.isUsableText(value) && !seen.has(value)) {
                seen.add(value);
                labels.push(value);
            }
        }
        return labels;
    }

    translateActiveButtons() {
        const runtime = this.getRuntime();
        if (!this.isRuntimeTranslationActive(runtime)) {
            return;
        }

        const knownLabels = new Set(this.getConfiguredButtonLabels());
        if (knownLabels.size === 0 || typeof document?.querySelectorAll !== 'function') {
            return;
        }

        const buttons = document.querySelectorAll(SUBMIT_BUTTON_SELECTOR);
        for (const button of buttons) {
            const currentValue = typeof button?.value === 'string' ? button.value : '';
            if (!knownLabels.has(currentValue)) {
                continue;
            }
            const translated = this.resolveRuntimeTranslation(
                currentValue,
                runtime,
                this.getCacheType()
            );
            if (translated !== currentValue) {
                button.value = translated;
            }
        }
    }

    enablePluginTranslation() {
        const interpreterProto = window.Game_Interpreter?.prototype;
        if (typeof interpreterProto?._performInput !== 'function') {
            return false;
        }

        const translator = this;
        const originalPerformInput = interpreterProto._performInput;
        interpreterProto._performInput = function (params, ...args) {
            const result = originalPerformInput.call(this, params, ...args);
            translator.translateActiveButtons();
            return result;
        };

        this.translateActiveButtons();
        return true;
    }

    buildUniqueItems(runtime) {
        const labels = this.getConfiguredButtonLabels();
        return labels.map((value, index) => ({
            type: this.getCacheType(),
            id: `plugin_111_input_form_mz_${index}`,
            value,
            cacheKey: runtime.getCacheKey(value, this.getCacheType()),
        }));
    }

    collectUntranslated({ runtime }) {
        if (!runtime) {
            return [];
        }
        return this.buildUniqueItems(runtime).filter(
            (item) => !runtime.hasUsableCacheValue(item.cacheKey)
        );
    }

    getCachedCountsSync({ runtime }) {
        if (!runtime) {
            return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
        }
        const items = this.buildUniqueItems(runtime);
        const left = items.filter((item) => !runtime.hasUsableCacheValue(item.cacheKey)).length;
        return {
            total: items.length,
            left,
            totalStrings: items.length,
            leftStrings: left,
        };
    }
}
