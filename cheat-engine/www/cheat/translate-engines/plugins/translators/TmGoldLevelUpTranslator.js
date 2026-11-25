import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** TMGoldLevelUp (MV) and TMGoldLevelUpMZ: command, funding and skill labels. */
export class TmGoldLevelUpTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TMGoldLevelUp';
    }
    getPluginAliases() {
        return ['TMGoldLevelUp', 'TMGoldLevelUpMZ'];
    }
    getCacheType() {
        return 'plugin_tm_gold_level_up';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts(parameters) {
        for (const field of [
            'levelUpCommand',
            'currentGold',
            'learnSkill',
            'execLevelUpText',
            'cancelLevelUpText',
        ]) {
            const text = parameters[field];
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_Base?.prototype;
        if (typeof prototype?.drawText !== 'function') return false;
        const original = prototype.drawText;
        const translator = this;
        prototype.drawText = function (text, ...args) {
            if (
                [
                    'Window_GoldLevelUpCommand',
                    'Window_GoldLevelUpStatus',
                    'Window_MenuCommand',
                    'Window_Status',
                ].includes(this.constructor.name)
            ) {
                text = translator.resolveText(text, translator.getRuntime());
            }
            return original.call(this, text, ...args);
        };
        this.precomputeCounts().catch((error) =>
            console.warn('[TmGoldLevelUpTranslator] Source scan failed', error)
        );
        return true;
    }
}
