import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** ChangeSelectItemWindowMZ (MZ), including the author's reading/gift help extension.
 * Read immutable script literals; translate help output without changing item metadata.
 */
export class ChangeSelectItemWindowMZTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'ChangeSelectItemWindowMZ';
    }
    getCacheType() {
        return 'plugin_change_select_item_window_mz';
    }
    shouldScanEventData() {
        return false;
    }
    collectSourceCatalog(source) {
        const catalog = super.collectSourceCatalog(source);
        for (const entry of [...catalog.entries]) {
            for (const part of entry.parts || []) {
                // A template may stop halfway through an escape argument. Only
                // its complete visible label belongs in the translation catalog.
                const text = part.replace(/\\+[A-Za-z]+\[[^\]]*$/, '').trim();
                if (text && /\p{L}/u.test(text) && !text.includes('\\'))
                    catalog.entries.push({ text });
            }
        }
        return catalog;
    }
    resolveText(text, runtime, depth = 0, allowFragments = true) {
        if (typeof text !== 'string' || !this.isRuntimeTranslationActive(runtime)) return text;
        // Progress templates are embedded after the description and ability.
        // Keep their counter as a captured value, never as a new cache key.
        for (const template of this.templates) {
            if (!template.parts[0] || !template.parts.at(-1)) continue;
            const pattern = new RegExp(template.pattern.source.slice(1, -1), 'g');
            text = text.replace(pattern, (match) =>
                super.resolveText(match, runtime, depth, false)
            );
        }
        return super.resolveText(text, runtime, depth, allowFragments);
    }
}
