import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';

/** ShopScene_Extension (MZ): comparison labels, including empty equipment slots.
 * Resolve original parameter labels only at the shared drawing boundary.
 */
export class ShopSceneExtensionTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'ShopScene_Extension';
    }
    getCacheType() {
        return 'plugin_shop_scene_extension';
    }
    shouldScanEventData() {
        return false;
    }
    collectParameterTexts() {
        // Runtime parameters may already contain translated display values.
    }
    async collectAdditionalTexts() {
        const response = await fetch('js/plugins.js');
        if (!response.ok) throw new Error('Cannot read ShopScene_Extension source manifest');
        const { bindings } = readJavaScriptLiteralData(await response.text(), ['$plugins']);
        const plugin = (bindings.$plugins || []).find(
            (entry) => entry.status && entry.name.split('/').pop() === this.getPluginName()
        );
        const text = plugin?.parameters?.NoneItemText;
        if (this.isUsableText(text)) this.entries.set(text, { text });
    }
}
