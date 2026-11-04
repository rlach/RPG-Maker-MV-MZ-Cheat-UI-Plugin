import { JsonTextCommandTranslator } from '../JsonTextCommandTranslator.js';

/** VisuStella Visual Text Windows v1.01 (MZ): JSON event text before native sizing. */
export class VisuVisualTextWindowsTranslator extends JsonTextCommandTranslator {
    getPluginName() {
        return 'VisuMZ_3_VisualTextWindows';
    }
    getPluginLabel() {
        return 'VisuStella Visual Text Windows';
    }
    getCacheType() {
        return 'plugin_visu_visual_text_windows';
    }
    getTextCommandName() {
        return 'AddChangeVisualTextWindow';
    }
}
