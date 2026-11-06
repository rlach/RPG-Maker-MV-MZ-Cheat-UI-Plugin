import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';

/** PH_Warehouse_MZ (MZ, installed unversioned build).
 * Scans display literals and templates, preserving plugin configuration and logic.
 */
export class PHWarehouseTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'PH_Warehouse_MZ';
    }
    getPluginLabel() {
        return 'PH Warehouse MZ';
    }
    getCacheType() {
        return 'plugin_ph_warehouse';
    }
    collectCommandTexts(list) {
        super.collectCommandTexts(list);
        for (const command of list || []) {
            const p = command?.parameters;
            if (
                command?.code === 357 &&
                p[0] === this.getPluginName() &&
                ['Create', 'Show'].includes(p[1]) &&
                this.isUsableText(p[3]?.title)
            ) {
                const text = p[3].title;
                this.entries.set(text, { text });
            }
        }
    }
    collectParameterTexts(parameters) {
        super.collectParameterTexts(parameters);
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (
                typeof value === 'string' &&
                /^(?:Withdraw_Text|Deposit_Text|All_Text|Available_Space_Text)$/.test(
                    path[path.length - 1]
                )
            )
                this.entries.set(value, { text: value });
        });
    }
}
