import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * Keke_ChangeLayoutLight 1.8.1 (MZ).
 * Translate position option labels at presentation only: Japanese config values
 * are also layout selectors and must remain unchanged for cycling and layout logic.
 */
export class KekeChangeLayoutLightTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Keke_ChangeLayoutLight';
    }
    getPluginLabel() {
        return 'Keke Change Layout Light';
    }
    getCacheType() {
        return 'plugin_keke_change_layout_light';
    }
    async buildCatalog() {
        for (const text of ['左', '右', '上', '下']) this.entries.set(text, { text });
    }
    enablePluginTranslation() {
        const proto = window.Window_Options?.prototype;
        if (typeof proto?.statusText !== 'function') return false;
        const original = proto.statusText;
        const translator = this;
        const symbols = new Set(['menuCmdPos', 'battleCmdPos', 'menuHelpPos', 'touchUIPos']);
        proto.statusText = function (index) {
            const text = original.apply(this, arguments);
            return symbols.has(this.commandSymbol(index))
                ? translator.resolveRuntimeTranslation(
                      text,
                      translator.getRuntime(),
                      translator.getCacheType(),
                      {
                          requireRuntimeTranslationActive: true,
                      }
                  )
                : text;
        };
        return true;
    }
}
