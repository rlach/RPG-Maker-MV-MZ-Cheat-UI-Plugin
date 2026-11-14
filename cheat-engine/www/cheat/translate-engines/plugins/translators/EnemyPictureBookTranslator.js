import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';
import { escapeCatalogPattern } from './JavaScriptTextCatalog.js';

/** EnemyPictureBook (MZ). Terms, completion templates and note-authored descriptions.
 * Resolve descriptions before wrapping and measuring; enemy records stay untouched.
 */
export class EnemyPictureBookTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'EnemyPictureBook';
    }
    getCacheType() {
        return 'plugin_enemy_picture_book';
    }
    getParameterTextPattern() {
        return /^terms\//;
    }
    async collectAdditionalTexts() {
        const parameters = this.findPluginEntry(this.getPluginName())?.parameters || {};
        const tag = escapeCatalogPattern(parameters.descTag || '図鑑説明');
        const response = await fetch('data/Enemies.json');
        if (!response.ok) throw new Error(`Cannot read Enemies: ${response.status}`);
        for (const enemy of parseJsonSafely(await response.text(), [])) {
            const note = enemy?.note || '';
            const block = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i').exec(note);
            const single = new RegExp('<' + tag + '\\s*:\\s*([^>]*)>', 'i').exec(note);
            const text = block
                ? block[1].replace(/^\r?\n/, '').replace(/\r?\n\s*$/, '')
                : single?.[1].replace(/\\n/g, '\n');
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_EnemyBookStatus?.prototype;
        if (typeof prototype?.wrapLines !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        const original = prototype.wrapLines;
        const translator = this;
        prototype.wrapLines = function (text, ...args) {
            return original.call(
                this,
                translator.resolveText(text, translator.getRuntime()),
                ...args
            );
        };
        this.hookDrawing(window.Window_Base.prototype, 'textWidth');
        this.hookDrawing(window.Window_Base.prototype, 'textSizeEx');
        return true;
    }
}
