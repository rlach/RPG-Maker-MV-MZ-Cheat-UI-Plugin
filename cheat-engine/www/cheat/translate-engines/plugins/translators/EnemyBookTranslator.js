import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** Standard EnemyBook (MV). Descriptions are display values in desc1/desc2 notes.
 * Translate complete lines before layout, without changing enemy metadata.
 */
export class EnemyBookTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'EnemyBook';
    }
    getCacheType() {
        return 'plugin_enemy_book';
    }
    getSourcePluginNames() {
        return [];
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        const response = await fetch('data/Enemies.json');
        if (!response.ok) throw new Error(`Cannot read Enemies: ${response.status}`);
        for (const enemy of parseJsonSafely(await response.text(), [])) {
            for (const match of (enemy?.note || '').matchAll(/<desc[12]:([^>]*)>/gi)) {
                const text = match[1];
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_Base?.prototype;
        if (typeof prototype?.drawTextEx !== 'function') return false;
        const original = prototype.drawTextEx;
        const translator = this;
        prototype.drawTextEx = function (text, ...args) {
            if (this.constructor.name === 'Window_EnemyBookStatus')
                text = translator.resolveRuntimeTranslation(
                    text,
                    translator.getRuntime(),
                    translator.getCacheType(),
                    { requireRuntimeTranslationActive: true }
                );
            return original.call(this, text, ...args);
        };
        return true;
    }
}
