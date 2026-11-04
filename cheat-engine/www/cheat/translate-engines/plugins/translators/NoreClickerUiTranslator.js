import { NoreRogueUiTranslator } from './NoreRogueUiTranslator.js';

/**
 * Nore_Clicker family, unversioned TypeScript-compiled MZ build (RJ01564172).
 * Uses the shared Nore source/vocabulary and metadata catalog. Translate bubble
 * text before line splitting; never change dialogue selection, upgrade costs,
 * item identities or image assets.
 */
export class NoreClickerUiTranslator extends NoreRogueUiTranslator {
    getPluginName() {
        return 'Nore_ClickerMain';
    }

    getPluginAliases() {
        return [this.getPluginName()];
    }

    getPluginLabel() {
        return 'Nore Clicker UI';
    }

    getCacheType() {
        return 'plugin_nore_clicker_ui';
    }

    getSourcePluginNames() {
        return [...new Set([...super.getSourcePluginNames(), 'Vocab'])];
    }

    enablePluginTranslation() {
        const prototype = window.ClickerDialogue?.prototype;
        if (typeof prototype?.texts !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        const texts = prototype.texts;
        const translator = this;
        prototype.texts = function (...args) {
            const lines = texts.apply(this, args);
            const source = lines.join('\n');
            return translator.resolveText(source, translator.getRuntime(), 0, false).split('\n');
        };
        return true;
    }
}
