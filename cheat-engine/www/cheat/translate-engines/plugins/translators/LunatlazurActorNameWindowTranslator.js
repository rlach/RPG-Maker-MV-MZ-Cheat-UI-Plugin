import { TAG_BRACKET, TAG_TYPE } from '../../ai-engine/constants.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

const LUNATLAZUR_ACTOR_NAME_WINDOW_PLUGIN_TAGS = [
    {
        description: 'Creates an actor name window with x string.',
        type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
        tagSymbol: 'N',
        bracket: TAG_BRACKET.ANGLE,
        maskValue: false,
        requiredConsistency: true,
        alwaysTranslate: true,
        alwaysAddToKnowledgeBase: false,
    },
];

export class LunatlazurActorNameWindowTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'Lunatlazur_ActorNameWindow';
    }

    getPluginLabel() {
        return 'Lunatlazur ActorNameWindow';
    }

    getCacheType() {
        return 'plugin_lunatlazur_actor_name_window';
    }

    enablePluginTranslation() {
        this.registerPluginCustomTags(LUNATLAZUR_ACTOR_NAME_WINDOW_PLUGIN_TAGS);
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
