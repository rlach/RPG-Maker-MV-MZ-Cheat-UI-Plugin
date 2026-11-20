import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike, parseJsonSafely } from './TranslatorHelpers.js';

/** Display-only support for the Purefull Lily menu and battle plugin family. */
export class PurefullBattleMenuTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'VE_Single_Actor_MZ';
    }
    getPluginLabel() {
        return 'Single-actor menu, battle logs, predictions and rewards';
    }
    getPluginAliases() {
        return [
            'VE_Single_Actor_MZ',
            'BattleLogOutput',
            'Keke_PredictionSystem',
            'NRP_VictoryRewards_Custom',
        ];
    }
    getCacheType() {
        return 'plugin_purefull_battle_menu';
    }
    collectMapTexts() {}
    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (
                typeof value !== 'string' ||
                !value.trim() ||
                parseJsonSafely(value, value) !== value
            )
                return;
            const field = [...path].reverse().find((part) => !/^\d+$/.test(part)) || '';
            if (/(?:name|text|label|headline|message|display)$/i.test(field))
                this.entries.set(value, { text: value });
        });
    }
    async collectAdditionalTexts() {
        let skills = window.$dataSkills;
        if (!Array.isArray(skills)) {
            const response = await fetch('data/Skills.json');
            if (!response.ok) throw Error(`Cannot read Skills: ${response.status}`);
            skills = JSON.parse(await response.text());
        }
        for (const skill of skills) {
            if (!skill) continue;
            // Prediction labels override the skill name via note metadata.
            for (const tag of skill.note.matchAll(/<(?:行動予測|prediction)\s*:\s*([^>]+)>/gi)) {
                const text = /(?:text|テキスト)\s*[:：]\s*([^,;]+)/i.exec(tag[1])?.[1]?.trim();
                if (text) this.entries.set(text, { text });
            }
        }
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        const manager = window.BattleManager;
        if (typeof manager?.displayCustomLog === 'function') {
            const display = manager.displayCustomLog;
            const translator = this;
            manager.displayCustomLog = function (text, ...args) {
                return display.call(
                    this,
                    translator.resolveText(text, translator.getRuntime()),
                    ...args
                );
            };
        }
        return true;
    }
}
