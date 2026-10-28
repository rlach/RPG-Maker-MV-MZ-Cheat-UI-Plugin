import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';

/**
 * Triacontane GraphicalDesignMode 2.10.7, MV (including RJ293625).
 * Its private settings table adds custom windows to menu/title/battle scenes.
 * Read only windows[].lines; image names, switches and ContainerProperties
 * geometry remain technical. Inherited drawing hooks translate before escape
 * conversion without replacing the private source table or switch conditions.
 */
export class GraphicalDesignModeTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'GraphicalDesignMode';
    }
    getPluginLabel() {
        return 'GraphicalDesignMode custom windows';
    }
    getCacheType() {
        return 'plugin_graphical_design_mode';
    }
    shouldScanEventData() {
        return false;
    }
    collectSourceCatalog(source) {
        const { bindings } = readJavaScriptLiteralData(source, ['settings']);
        const entries = [];
        for (const scene of Object.values(bindings.settings || {})) {
            for (const win of scene?.windows || []) {
                for (const line of win.lines || []) {
                    if (!this.isUsableText(line)) continue;
                    // Window_Custom strips the alignment command before drawing.
                    const text = line.replace(/\\al\[[^\]]*\]/gi, '');
                    // Pure variable/icon/color chains and numeric gauges do not
                    // contain words to translate, but Japanese units do.
                    const visible = text.replace(/\\[a-z]+\[[\d, .+-]*\]/gi, '');
                    if (/\p{L}/u.test(visible)) entries.push({ text });
                }
            }
        }
        return { entries };
    }
}
