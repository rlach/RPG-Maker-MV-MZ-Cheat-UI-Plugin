import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Cultivator Ver1b (MV). Custom Mu windows and locally modified stock plugins.
 * Translate only presentation calls, leaving save-field selectors and game logic intact.
 */
export class CultivatorUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return '_Mu_SceneSagyou';
    }
    getPluginLabel() {
        return 'Cultivator UI';
    }
    getCacheType() {
        return 'plugin_cultivator_ui';
    }
    getSourcePluginNames() {
        return [
            '_Mu_SceneSagyou',
            '_Mu_Window',
            '_Mu_EV',
            'YEP_EquipCore',
            'TMStatusMenuEx',
            'YEP_MainMenuVar',
            'YEP_SaveCore',
            'AltMenuScreen_kytp',
            'FTKR_ItemSubCommand',
        ];
    }
    collectSourceCatalog(source) {
        const catalog = super.collectSourceCatalog(source);
        // These are runtime escape codes, not JavaScript string literals.
        for (const entry of catalog.entries)
            entry.text = entry.text.replace(/\\\\COT\[/g, '\\COT[');
        return catalog;
    }
    async collectAdditionalTexts() {
        for (const season of ['春', '夏', '秋', '冬']) {
            for (const text of [`${season}の%1日`, `%1年目 ${season}の%2日`])
                this.entries.set(text, { text });
        }
        this.entries.set('日数', { text: '日数' });
        const parameters = this.findPluginEntry('FTKR_ItemSubCommand')?.parameters || {};
        for (const [field, text] of Object.entries(parameters))
            if (/^(?:Command|Confirmation) .* Format$/.test(field) && this.isUsableText(text))
                this.entries.set(text, { text });
        // The native windows assemble dates across assignments and branches.
        // Describe the complete display forms so variable values remain placeholders.
        const source = ['春', '夏', '秋', '冬']
            .flatMap((season) => [
                `this.drawText(year + "年目 ${season}の" + day + "日");`,
                `this.drawText(" " + year + "年目 ${season}の" + day + "日");`,
                `this.drawText("${season}の" + day + "日");`,
                `this.drawText("\\\\C[16]日数   \\\\C[0]${season}の" + day + "日");`,
            ])
            .join('\n');
        for (const entry of this.collectSourceCatalog(source).entries)
            this.entries.set(entry.text, entry);
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (!this.isRuntimeTranslationActive(runtime) || typeof text !== 'string') return text;
        const dated = text.replace(
            /(?:(\d+)年目 )?([春夏秋冬])の(\d+)日/g,
            (source, year, season, day) => {
                const key = year ? `%1年目 ${season}の%2日` : `${season}の%1日`;
                const translated = this.resolveRuntimeTranslation(key, runtime);
                if (translated === key) return source;
                const values = year ? [year, day] : [day];
                return translated.replace(/%([12])/g, (_, index) => values[Number(index) - 1]);
            }
        );
        return super.resolveText(
            dated.replace(/日数/g, () => this.resolveRuntimeTranslation('日数', runtime)),
            runtime,
            depth,
            allowFragments
        );
    }
    enablePluginTranslation() {
        const manager = window.DataManager;
        if (typeof manager?.itemSecondaryCategories !== 'function') return false;
        if (!super.enablePluginTranslation()) return false;
        const message = window.Window_Message?.prototype;
        const convert = message?.convertEscapeCharacters;
        const translator = this;
        if (typeof convert === 'function')
            message.convertEscapeCharacters = function (...args) {
                const converted = convert.apply(this, args);
                const runtime = translator.getRuntime();
                if (!translator.isRuntimeTranslationActive(runtime)) return converted;
                // Choice help expands variable-only messages after startMessage.
                const source = converted.split('\x1b').join('\\');
                const display = source
                    .split('\n')
                    .map((line) => {
                        const cached = translator.resolveRuntimeTranslation(
                            line,
                            runtime,
                            ['message', 'command'],
                            { harvestMissing: false }
                        );
                        return cached !== line ? cached : translator.resolveText(line, runtime);
                    })
                    .join('\n');
                return display === source ? converted : display.replace(/\\/g, '\x1b');
            };
        const original = manager.itemSecondaryCategories;
        manager.itemSecondaryCategories = function (item) {
            const source = item?._translateOriginal?.note;
            if (typeof source !== 'string') return original.apply(this, arguments);
            const note = item.note;
            const categories = item._secondaryCategories;
            item.note = source;
            delete item._secondaryCategories;
            try {
                return original.apply(this, arguments);
            } finally {
                item.note = note;
                if (categories === undefined) delete item._secondaryCategories;
                else item._secondaryCategories = categories;
            }
        };
        return true;
    }
}
