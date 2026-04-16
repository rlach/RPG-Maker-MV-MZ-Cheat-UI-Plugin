// Registers LL_StandingPicture control-character tags with the translation engine
// so their command prefixes and bracketed values remain protected during translation.

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_LL_STANDING_PICTURE_TRANSLATOR_HOOKED__';
const CACHE_TYPE = 'plugin_ll_standing_picture';

const LL_STANDING_PICTURE_PLUGIN_TAGS = [
    {
        description: 'LL StandingPicture show slot 1',
        type: 'withCustomParameter',
        tagSymbol: 'F',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'LL StandingPicture show slot 2',
        type: 'withCustomParameter',
        tagSymbol: 'FF',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'LL StandingPicture show slot 3',
        type: 'withCustomParameter',
        tagSymbol: 'FFF',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'LL StandingPicture show slot 4',
        type: 'withCustomParameter',
        tagSymbol: 'FFFF',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'LL StandingPicture motion slot 1',
        type: 'withCustomParameter',
        tagSymbol: 'M',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'LL StandingPicture motion slot 2',
        type: 'withCustomParameter',
        tagSymbol: 'MM',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'LL StandingPicture motion slot 3',
        type: 'withCustomParameter',
        tagSymbol: 'MMM',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'LL StandingPicture motion slot 4',
        type: 'withCustomParameter',
        tagSymbol: 'MMMM',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'LL StandingPicture focus control',
        type: 'withCustomParameter',
        tagSymbol: 'AA',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
    {
        description: 'LL StandingPicture hold control',
        type: 'withCustomParameter',
        tagSymbol: 'FH',
        bracket: '[',
        maskValue: true,
        requiredConsistency: true,
    },
];

export class LLStandingPictureTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'LL_StandingPicture';
    }

    getPluginLabel() {
        return 'LL StandingPicture';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        this.registerPluginCustomTags(LL_STANDING_PICTURE_PLUGIN_TAGS);
        window[RUNTIME_HOOK_GUARD] = true;
    }

    async prepareTranslator() {
        return Promise.resolve();
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
