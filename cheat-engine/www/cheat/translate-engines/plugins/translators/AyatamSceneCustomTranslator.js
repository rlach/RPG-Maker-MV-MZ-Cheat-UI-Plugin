import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely, walkNestedJsonLike } from './TranslatorHelpers.js';

/** Ayatam_SceneCustom (MV). Parse nested drawing scripts without rewriting executable settings. */
export class AyatamSceneCustomTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'Ayatam_SceneCustom';
    }
    getCacheType() {
        return 'plugin_ayatam_scene_custom';
    }
    shouldScanEventData() {
        return false;
    }
    isDisplayFragment() {
        return false;
    }
    collectParameterTexts(parameters) {
        super.collectParameterTexts(parameters);
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (
                typeof value !== 'string' ||
                parseJsonSafely(value, value) !== value ||
                !/DrawList$/.test([...path].reverse().find((field) => !/^\d+$/.test(field)) || '')
            )
                return;
            for (const entry of this.extractCatalog(value).entries)
                this.entries.set(entry.text, entry);
        });
    }
}
