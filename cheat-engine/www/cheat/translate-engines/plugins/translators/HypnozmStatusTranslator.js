import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Hypnozm v1.06 (MZ). Common events assemble character biographies and status
 * tables from nested variable arrays. Translate their presentation only, after
 * escape expansion, without changing those arrays or script expressions.
 */
export class HypnozmStatusTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'MenuCommonEvent';
    }
    getPluginLabel() {
        return 'Hypnozm character and menu information';
    }
    getCacheType() {
        return 'plugin_hypnozm_status';
    }
    detectPlugin() {
        const menu = this.findPluginEntry('LL_MenuScreenCustom');
        return !!(
            super.detectPlugin() &&
            menu?.status &&
            menu.parameters?.leftBottomBlockValue?.includes('名声上限') &&
            this.findPluginEntry('NRP_AdditionalClasses')?.status
        );
    }
    getSourcePluginNames() {
        return ['MenuCommonEvent', 'LL_MenuScreenCustom', 'NRP_AdditionalCCScene'];
    }
    async collectAdditionalTexts() {
        const parameters = this.findPluginEntry('LL_MenuScreenCustom').parameters;
        for (const field of ['rightBlockValue', 'rightBottomBlockValue', 'leftBottomBlockValue']) {
            const catalog = this.extractCatalog(`const text = ${parameters[field]};`);
            for (const entry of catalog.entries) this.entries.set(entry.text, entry);
        }
        // Biographies are stored with a trailing newline, then embedded in a
        // larger variable-backed page. Keep line keys available for that page.
        for (const entry of [...this.entries.values()]) {
            for (const text of entry.text.split('\n')) {
                if (this.isUsableText(text) && !this.entries.has(text))
                    this.entries.set(text, { text });
            }
        }
        for (const text of ['現在の経験値', '次のレベル']) this.entries.set(text, { text });
        // The weekday and hour are adjacent dynamic expressions. The source
        // scanner cannot separate them, so retain that pair as one value.
        const date = {
            text: '\\COT[0]月\\COT[1]日\\COT[2]時\\COT[3]分',
            parts: ['', '月', '日', '時', '分'],
        };
        this.entries.set(date.text, date);
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (typeof text === 'string' && text.includes('\n'))
            return text
                .split('\n')
                .map((line) => super.resolveText(line, runtime, depth, allowFragments))
                .join('\n');
        return super.resolveText(text, runtime, depth, allowFragments);
    }
    enablePluginTranslation() {
        if (!window.Window_Base?.prototype.convertEscapeCharacters) return false;
        if (!super.enablePluginTranslation()) return false;
        const translator = this;
        const convert = window.Window_Base.prototype.convertEscapeCharacters;
        window.Window_Base.prototype.convertEscapeCharacters = function (...args) {
            return translator.resolveText(convert.apply(this, args), translator.getRuntime());
        };
        return true;
    }
}
