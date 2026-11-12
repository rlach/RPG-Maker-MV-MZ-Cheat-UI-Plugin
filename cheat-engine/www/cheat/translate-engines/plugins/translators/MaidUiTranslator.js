import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * maid v1.0.0 (MZ, RJ01376954), with d9m custom UI/MapPaint and
 * SceneCustomMenu. HUD, notifications, help, status and map labels are drawn
 * as text. Translate presentation only; variables, UI IDs and assets stay intact.
 */
export class MaidUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'maid';
    }
    getPluginLabel() {
        return 'Maid custom UI';
    }
    getCacheType() {
        return 'plugin_maid_ui';
    }
    getSourcePluginNames() {
        return [
            'maid',
            'd9mCustomUI',
            'd9mMapPaint',
            'd9mCustomMenu',
            'SceneCustomMenu',
            'SceneGlossaryEx',
        ];
    }
    collectParameterTexts(parameters) {
        super.collectParameterTexts(parameters);
        if (parameters?.popupMessage)
            this.entries.set(parameters.popupMessage, { text: parameters.popupMessage });
    }
    isDisplayFragment(text) {
        return text === '夜' || super.isDisplayFragment(text);
    }
    collectCommandTexts(list = []) {
        super.collectCommandTexts(list);
        // The HUD's time-of-day strings are script operands assigned to variable
        // 11. Read their literals without evaluating or translating the variable.
        for (const command of list || []) {
            const p = command.parameters;
            if (command.code !== 122 || p[0] !== 11 || p[1] !== 11 || p[4] == null) continue;
            const source = p[3] === 4 ? String(p[4]) : JSON.stringify(p[4]);
            for (const entry of this.collectSourceCatalog(source).entries)
                this.entries.set(entry.text, entry);
        }
    }
    enablePluginTranslation() {
        if (!super.enablePluginTranslation()) return false;
        // MapPaint and d9m UI size their bitmaps from the text before drawing.
        // Measure the same translated text so longer labels are not clipped.
        this.hookDrawing(window.Bitmap.prototype, 'measureTextWidth');
        // d9m allocates each HUD text bitmap from textSizeEx before drawing.
        // Run escape expansion and translation during that measurement as well.
        this.hookDrawing(window.Window_Base.prototype, 'textSizeEx');
        const translator = this;
        const convert = window.Window_Base.prototype.convertEscapeCharacters;
        window.Window_Base.prototype.convertEscapeCharacters = function (...args) {
            const text = convert.apply(this, args);
            // d9m expands HUD variables inside drawTextEx, after the first
            // translation pass. Resolve their display values before glyph output.
            if (translator.drawing && !(this instanceof window.Window_Message))
                return translator.resolveText(text, translator.getRuntime());
            return text;
        };
        return true;
    }
}
