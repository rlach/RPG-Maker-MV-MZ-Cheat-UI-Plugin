import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { walkNestedJsonLike } from './TranslatorHelpers.js';

/** AbilitySystem (MZ, installed unversioned build).
 * Scans display literals and templates, preserving plugin configuration and logic.
 */
export class AbilitySystemTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'AbilitySystem';
    }
    getPluginLabel() {
        return 'Ability System';
    }
    getCacheType() {
        return 'plugin_ability_system';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts(parameters) {
        super.collectParameterTexts(parameters);
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (
                typeof value === 'string' &&
                /^(?:CostText|EmptySlotText|MenuAbilitySystemText)$/.test(path[path.length - 1])
            )
                this.entries.set(value, { text: value });
        });
    }
}
