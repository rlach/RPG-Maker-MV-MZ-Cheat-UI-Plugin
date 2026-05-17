import { TAG_BRACKET, TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * Message_pEx_riru plugin translator (MV).
 *
 * Supported versions:
 * - Unknown version (plugin header does not declare a version): MV target.
 *
 * Notes:
 * - This plugin adds picture-control escape tags in message text.
 * - For this translator, only tag registration is required so tag syntax is preserved
 *   during translation.
 * - Multi-parameter tags are masked and marked with required consistency.
 */
const MESSAGE_PEX_RIRU_TAGS = [
    {
        description: 'Changes picture name with picture id and new picture name.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICN',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Changes picture opacity with picture id and opacity value.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICO',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Changes picture origin with picture id and origin value.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICOR',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Changes picture X coordinate with picture id and x value.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICX',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Changes picture Y coordinate with picture id and y value.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICY',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Changes picture X scale with picture id and scale value.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICSX',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Changes picture Y scale with picture id and scale value.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICSY',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Changes picture blend mode with picture id and blend mode value.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICB',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Changes picture tone with picture id and RGBA tone values.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICT',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Changes picture rotation speed with picture id and angle value.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'PICR',
        bracket: TAG_BRACKET.SQUARE,
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'Erases picture by picture id.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'PICE',
        requiredConsistency: true,
    },
];

export class MessagePExRiruTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'Message_pEx_riru';
    }

    getPluginLabel() {
        return 'Message pEx riru';
    }

    getCacheType() {
        return 'plugin_message_pex_riru';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(MESSAGE_PEX_RIRU_TAGS);
        return true;
    }

    async precomputeCounts() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}