import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { TAG_BRACKET, TAG_STYLE, TAG_TYPE } from '../../ai-engine/constants.js';

/**
 * Registration-only adapters for reusable MV plugins. No game-specific note
 * fields are included. Each adapter is detected and owns its tags independently.
 * Verified against the distributions bundled with Seed Presser v1.0.8:
 * MKR_ControlCharacterEx 1.2.1, FTKR_ExBattleCommand 2.2.2, TMEventItemEx,
 * EnemyPosition, MNKR_EnemyIcon, SkillEffectScript, HzRandomChoice,
 * FTKR_SkillCounter and PermanentState (versions unspecified where omitted).
 * These plugins add technical controls; none need separate translation entries.
 */
class PluginTagRegistration extends BasePluginTranslator {
    getPluginName() {
        return this.constructor.pluginName;
    }
    enablePluginTranslation() {
        this.registerPluginCustomTags(this.constructor.tags);
        return true;
    }
}

function xmlTag(tagSymbol, description, parameter = true) {
    return {
        tagSymbol,
        description,
        style: TAG_STYLE.XML,
        bracket: TAG_BRACKET.NONE,
        type: parameter ? TAG_TYPE.WITH_CUSTOM_PARAMETER : TAG_TYPE.WITHOUT_PARAMETER,
        maskValue: true,
        requiredConsistency: true,
        alwaysTranslate: false,
        alwaysAddToKnowledgeBase: false,
    };
}

export class MkrControlCharacterExTranslator extends PluginTagRegistration {
    static pluginName = 'MKR_ControlCharacterEx';
    static tags = [
        ['IM', 'Icon right margin in pixels'],
        ['SE', 'Sound effect filename and optional volume, pitch and pan'],
        ['ME', 'Music effect filename and optional volume, pitch and pan'],
        ['$', 'Gold window background and screen position'],
        ['N', 'Actor ID and optional name substring length'],
        ['P', 'Party member index and optional name substring length'],
    ].map(([tagSymbol, description]) => ({
        tagSymbol,
        description,
        style: TAG_STYLE.ESCAPE,
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
        alwaysTranslate: false,
        alwaysAddToKnowledgeBase: false,
    }));
}

export class EnemyPositionTranslator extends PluginTagRegistration {
    static pluginName = 'EnemyPosition';
    static tags = ['PosX', 'PosY'].map((symbol) => xmlTag(symbol, 'Enemy screen coordinate'));
}

export class MnkrEnemyIconTranslator extends PluginTagRegistration {
    static pluginName = 'MNKR_EnemyIcon';
    static tags = [xmlTag('MNKR_EnemyIcon', 'Enemy icon IDs for normal and selected display')];
}

export class FtkrExBattleCommandTranslator extends PluginTagRegistration {
    static pluginName = 'FTKR_ExBattleCommand';
    static tags = [xmlTag('FTKR_ACTOR_COMMAND', 'Actor command symbol and technical arguments')];
}

export class TmEventItemExTranslator extends PluginTagRegistration {
    static pluginName = 'TMEventItemEx';
    static tags = [xmlTag('subCategory', 'Internal item selection category identifier')];
}

export class HzRandomChoiceTranslator extends PluginTagRegistration {
    static pluginName = 'HzRandomChoice';
    static tags = ['random', 'timer'].map((symbol) =>
        xmlTag(symbol, 'Choice behavior control', false)
    );
}

export class PermanentStateTranslator extends PluginTagRegistration {
    static pluginName = 'PermanentState';
    static tags = ['Permanent', '永続ステート'].map((symbol) =>
        xmlTag(symbol, 'Persistent state marker', false)
    );
}

export class SkillEffectScriptTranslator extends PluginTagRegistration {
    static pluginName = 'SkillEffectScript';
    static tags = ['script', '/script'].map((symbol) =>
        xmlTag(symbol, 'Skill effect script block delimiter', false)
    );
}

export class FtkrSkillCounterTranslator extends PluginTagRegistration {
    static pluginName = 'FTKR_SkillCounter';
    static tags = [
        xmlTag('InvalidSkillType', 'Skill type IDs to invalidate'),
        xmlTag('スキルタイプ無効化', 'Skill type IDs to invalidate'),
    ];
}
