import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** SoN_StatusCustom (unversioned MZ, RJ01295905).
 * Catalog status display templates and LL menu date expressions.
 * Variable values use the existing safe-variable translation settings.
 * Numeric counters and stored variable values are not rewritten here.
 */
export class SonStatusCustomTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'SoN_StatusCustom';
    }
    getPluginLabel() {
        return 'SoN Status and menu UI';
    }
    getCacheType() {
        return 'plugin_son_status_ui';
    }

    async collectAdditionalTexts() {
        const parameters = this.findPluginEntry('LL_MenuScreenCustom')?.parameters || {};
        for (const key of ['leftBlockLabel', 'rightBlockLabel']) {
            const text = parameters[key];
            if (this.isUsableText(text)) this.entries.set(text, { text });
        }
        for (const key of ['leftBlockValue', 'rightBlockValue']) {
            if (!this.isUsableText(parameters[key])) continue;
            const catalog = this.extractCatalog(`this.drawText(${parameters[key]});`);
            for (const entry of catalog.entries) this.entries.set(entry.text, entry);
        }
    }

    shouldScanEventData() {
        return false;
    }
}
