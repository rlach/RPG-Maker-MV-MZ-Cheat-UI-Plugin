import { TAG_BRACKET, TAG_STYLE, TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

const YEP_MESSAGE_CORE_PLUGIN_TAGS = [
    {
        description: 'Resets text color to default.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'C',
        requiredConsistency: false,
    },
    {
        description: 'Waits x frames (60 frames = 1 second).',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'W',
        requiredConsistency: false,
    },
    {
        description: 'Creates a name box with x string. Left side.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'N',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: false,
    },
    {
        description: 'Creates a name box with x string. Centered.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'NC',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: false,
    },
    {
        description: 'Creates a name box with x string. Right side.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'NR',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: false,
    },
    {
        description:
            'If using word wrap mode, this will cause a line break (<line break> alias supported by plugin).',
        style: TAG_STYLE.XML,
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'br',
        requiredConsistency: false,
    },
    {
        description: 'Sets x position of text to x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PX',
        requiredConsistency: false,
    },
    {
        description: 'Sets y position of text to y.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PY',
        requiredConsistency: false,
    },
    {
        description: 'Sets outline colour to x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'OC',
        requiredConsistency: false,
    },
    {
        description: 'Sets outline width to x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'OW',
        requiredConsistency: false,
    },
    {
        description: 'Resets all font changes.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'FR',
        requiredConsistency: false,
        addSpace: true,
    },
    {
        description: 'Changes font size to x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'FS',
        requiredConsistency: false,
    },
    {
        description: 'Changes font name to x.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'FN',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: false,
    },
    {
        description: 'Toggles font boldness.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'FB',
        requiredConsistency: false,
        addSpace: true,
    },
    {
        description: 'Toggles font italic.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'FI',
        requiredConsistency: false,
        addSpace: true,
    },
    {
        description: 'Shows face of actor x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'AF',
        requiredConsistency: false,
    },
    {
        description: "Writes out actor's class name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'AC',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out actor's nickname.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'AN',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out actor's class name (no parameter form).",
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'AC',
        reservedWidth: 6,
        requiredConsistency: false,
        addSpace: true,
    },
    {
        description: 'Shows face of party member x.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PF',
        requiredConsistency: false,
    },
    {
        description: "Writes out party member x's class name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PC',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out party member x's nickname.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PN',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out class x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NC',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out item x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NI',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out weapon x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NW',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out armour x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NA',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out skill x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NS',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out state x's name.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NT',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out enemy x's name (supported by plugin implementation).",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'NE',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out item x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'II',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out weapon x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'IW',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out armour x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'IA',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out skill x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'IS',
        reservedWidth: 6,
        requiredConsistency: false,
    },
    {
        description: "Writes out state x's name including icon.",
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'IT',
        reservedWidth: 6,
        requiredConsistency: false,
    },
];

export class YepMessageCoreTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'YEP_MessageCore';
    }

    getPluginLabel() {
        return 'YEP Message Core';
    }

    getCacheType() {
        return 'plugin_yep_message_core';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(YEP_MESSAGE_CORE_PLUGIN_TAGS);
    }

    async prepareTranslator() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    countPluginAmountSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
