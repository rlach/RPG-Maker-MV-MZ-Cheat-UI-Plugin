import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import {
    parseJsonSafely,
    walkNestedJsonLike,
    createPositionalFormatCatalogEntry,
} from './TranslatorHelpers.js';

/** RJ01590123 custom FastEnchantSystem v19 (MZ).
 * Catalogs game-specific presentation text from FastEnchantSystem, RandomItem and LightweightToast,
 * event scripts and skill NameType metadata. Generated equipment names remain
 * unchanged in variables and dummy actors because upgrade scripts compare them.
 */
export class CeliaDungeonUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'FastEnchantSystem';
    }
    getPluginLabel() {
        return 'Celia dungeon UI and generated equipment';
    }
    getCacheType() {
        return 'plugin_celia_dungeon_ui';
    }
    getSourcePluginNames() {
        return ['FastEnchantSystem', 'LightweightToast', 'RandomItem'];
    }

    collectParameterTexts(parameters) {
        super.collectParameterTexts(parameters);
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (typeof value !== 'string' || parseJsonSafely(value, value) !== value) return;
            if (
                !/^(?:Terms |optionText$|textON$|textOFF$|keepAutoMode$|machinakaMode$|lines\/|Hotbar Command Name$|Attribute name$|Label of (?:stock Number|sold out)$|Exit Confirm Btn (?:Ok|Cancel)$)|(?:Text|Help|Message| Format| title| message)$/.test(
                    path.join('/')
                )
            )
                return;
            const entry = createPositionalFormatCatalogEntry(value);
            if (this.isUsableText(entry.text)) this.entries.set(entry.text, entry);
        });
    }

    collectCommandTexts(list = []) {
        super.collectCommandTexts(list);
        for (const command of list || []) {
            // Random equipment prefixes are authored as variable script operands.
            if (command.code !== 122 || command.parameters[3] !== 4) continue;
            const catalog = this.extractCatalog(command.parameters[4]);
            for (const entry of catalog.entries) this.entries.set(entry.text, entry);
        }
    }

    async collectAdditionalTexts() {
        const response = await fetch('data/Skills.json');
        if (!response.ok) throw new Error(`Cannot read Skills: ${response.status}`);
        const skills = parseJsonSafely(await response.text(), []);
        for (const skill of skills) {
            for (const match of (skill?.note || '').matchAll(/<NameType:([^>]+)>/gi)) {
                this.entries.set(match[1], { text: match[1] });
            }
        }
    }
}
