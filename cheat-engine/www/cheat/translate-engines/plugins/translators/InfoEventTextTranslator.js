import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** InfoEventText v1.1 (MZ). Comment-authored event captions, rendered by Bitmap. */
export class InfoEventTextTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'InfoEventText';
    }
    getCacheType() {
        return 'plugin_info_event_text';
    }
    getSourcePluginNames() {
        return [];
    }
    collectMapTexts() {}
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        this.hookDrawing(window.Bitmap.prototype, 'measureTextWidth');
        return true;
    }
    collectCommandTexts(list = []) {
        for (const command of list || []) {
            if (![108, 408].includes(command.code)) continue;
            const match = /^info:(.*?)(?:,(\d+))?$/.exec(command.parameters[0]);
            if (match && this.isUsableText(match[1]))
                this.entries.set(match[1], { text: match[1] });
        }
    }
}
