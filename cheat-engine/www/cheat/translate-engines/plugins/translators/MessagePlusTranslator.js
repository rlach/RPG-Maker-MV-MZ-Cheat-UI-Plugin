import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { registerTextLayoutProvider } from '../../../js/translation-runtime/TextLayoutProviders.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** MessagePlus 3.4.0 (MZ): a separate face window leaves message text at the
 * native newLineX for both portrait modes. Dimensions/font steps stay native.
 */
export class MessagePlusTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MessagePlus';
    }
    collectUntranslated() {
        return [];
    }
    enablePluginTranslation() {
        if (typeof window.Window_Message?.prototype.newLineX !== 'function') return false;
        const face = parseJsonSafely(
            this.findPluginEntry(this.getPluginName())?.parameters?.faceWindow,
            {}
        );
        registerTextLayoutProvider(this.getPluginName(), ({ window: target, type }) => {
            if (type === 'description' || !['true', true].includes(face.enabled)) return null;
            return { inset: target.newLineX({ rtl: false }) };
        });
        return true;
    }
}
