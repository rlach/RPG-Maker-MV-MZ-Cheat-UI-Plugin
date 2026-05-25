// Registers LL_StandingPicture control-character tags with the translation engine
// so their command prefixes and bracketed values remain protected during translation.

import { BasePluginTranslator } from '../BasePluginTranslator.js';

const CACHE_TYPE = 'plugin_ll_standing_picture';
const PLUGIN_NAME_ALIASES = ['LL_StandingPicture', 'LL_StandingPictureMV'];

const createMaskedBracketTag = (description, tagSymbol) => ({
    description,
    type: 'withCustomParameter',
    tagSymbol,
    bracket: '[',
    maskValue: true,
    requiredConsistency: true,
});

const LL_STANDING_PICTURE_PLUGIN_TAGS = [
    // Show picture tags documented for LL_StandingPicture (MV/MZ).
    createMaskedBracketTag('LL StandingPicture show slot 1 (shorthand)', 'F'),
    createMaskedBracketTag('LL StandingPicture show slot 2 (shorthand)', 'FF'),
    createMaskedBracketTag('LL StandingPicture show slot 3 (shorthand)', 'FFF'),
    createMaskedBracketTag('LL StandingPicture show slot 4 (shorthand)', 'FFFF'),
    createMaskedBracketTag('LL StandingPicture show slot 1', 'F1'),
    createMaskedBracketTag('LL StandingPicture show slot 2', 'F2'),
    createMaskedBracketTag('LL StandingPicture show slot 3', 'F3'),
    createMaskedBracketTag('LL StandingPicture show slot 4', 'F4'),
    createMaskedBracketTag('LL StandingPicture show slot 5', 'F5'),
    createMaskedBracketTag('LL StandingPicture show slot 6', 'F6'),
    createMaskedBracketTag('LL StandingPicture show slot 7', 'F7'),
    createMaskedBracketTag('LL StandingPicture show slot 8', 'F8'),

    // Motion tags documented for LL_StandingPicture (MV/MZ).
    createMaskedBracketTag('LL StandingPicture motion slot 1 (shorthand)', 'M'),
    createMaskedBracketTag('LL StandingPicture motion slot 2 (shorthand)', 'MM'),
    createMaskedBracketTag('LL StandingPicture motion slot 3 (shorthand)', 'MMM'),
    createMaskedBracketTag('LL StandingPicture motion slot 4 (shorthand)', 'MMMM'),
    createMaskedBracketTag('LL StandingPicture motion slot 1', 'M1'),
    createMaskedBracketTag('LL StandingPicture motion slot 2', 'M2'),
    createMaskedBracketTag('LL StandingPicture motion slot 3', 'M3'),
    createMaskedBracketTag('LL StandingPicture motion slot 4', 'M4'),
    createMaskedBracketTag('LL StandingPicture motion slot 5', 'M5'),
    createMaskedBracketTag('LL StandingPicture motion slot 6', 'M6'),
    createMaskedBracketTag('LL StandingPicture motion slot 7', 'M7'),
    createMaskedBracketTag('LL StandingPicture motion slot 8', 'M8'),

    // Focus and hold tags.
    createMaskedBracketTag('LL StandingPicture focus control', 'AA'),
    createMaskedBracketTag('LL StandingPicture hold control', 'FH'),
];

export class LLStandingPictureTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'LL_StandingPicture';
    }

    getPluginAliases() {
        return PLUGIN_NAME_ALIASES;
    }

    getPluginLabel() {
        return 'LL StandingPicture';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(LL_STANDING_PICTURE_PLUGIN_TAGS);
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
