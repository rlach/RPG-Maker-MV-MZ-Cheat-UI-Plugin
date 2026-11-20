import { ParameterLabelTranslator } from '../ParameterLabelTranslator.js';

export class BattleSystemSelectableTranslator extends ParameterLabelTranslator {
    getPluginName() {
        return 'BattleSystemSelectable';
    }
    getCacheType() {
        return 'plugin_battle_system_selectable';
    }
    getTextFields() {
        return ['textBattleSystem', 'textTpbActive', 'textTpbWait', 'textTurnBased'];
    }
    getOptionSymbol() {
        return 'battleSystem';
    }
}
