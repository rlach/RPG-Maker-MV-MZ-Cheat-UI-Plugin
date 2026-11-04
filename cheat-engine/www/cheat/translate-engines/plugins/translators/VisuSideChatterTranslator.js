import { JsonTextCommandTranslator } from '../JsonTextCommandTranslator.js';

/**
 * VisuStella Side Chatter v1.00 (MZ).
 * Collect SideChatterAdd text from map/common events and resolve the original
 * cache key before native notification layout. Icons and sound settings survive.
 */
export class VisuSideChatterTranslator extends JsonTextCommandTranslator {
    getPluginName() {
        return 'VisuMZ_4_SideChatter';
    }
    getPluginLabel() {
        return 'VisuStella Side Chatter';
    }
    getCacheType() {
        return 'plugin_visu_side_chatter';
    }
    getTextCommandName() {
        return 'SideChatterAdd';
    }
}
