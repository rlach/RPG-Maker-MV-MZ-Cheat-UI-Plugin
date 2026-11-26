import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { registerTextLayoutProvider } from '../../../js/translation-runtime/TextLayoutProviders.js';

/** DarkPlasma_AutoLineBreak 1.4.1 (MZ): expose the plugin's native right boundary.
 * No text is rewritten; the active window's ignore/enable state is respected.
 */
export class DarkPlasmaAutoLineBreakTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'DarkPlasma_AutoLineBreak';
    }
    collectUntranslated() {
        return [];
    }
    enablePluginTranslation() {
        const prototype = window.Window_Base?.prototype;
        if (
            typeof prototype?.lineWidth !== 'function' ||
            typeof prototype?.isAutoLineBreakEnabled !== 'function'
        )
            return false;
        registerTextLayoutProvider(this.getPluginName(), ({ window: target, type, geometry }) => {
            if (!target?.isAutoLineBreakEnabled()) return null;
            const start = type === 'description' ? target.baseTextRect().x : 0;
            return { width: Math.min(geometry.width, target.lineWidth() - start) };
        });
        return true;
    }
}
