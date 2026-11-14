import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** SRPG Gear MZ core. Vocabulary, event-authored conditions and enemy class captions. */
export class SrpgCoreTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'SRPG_core_MZ';
    }
    getCacheType() {
        return 'plugin_srpg_core';
    }
    getParameterTextPattern() {
        return /^(?:textSrpg\w+|enemyDefaultClass)$/;
    }
    shouldScanEventData() {
        return true;
    }
    collectMapTexts() {}
    isDisplayFragment() {
        return false;
    }
    async collectAdditionalTexts() {
        const response = await fetch('data/Enemies.json');
        if (!response.ok) throw new Error(`Cannot read Enemies: ${response.status}`);
        for (const enemy of parseJsonSafely(await response.text(), [])) {
            for (const match of (enemy?.note || '').matchAll(/<srpgClass:([^>]+)>/gi)) {
                const text = match[1];
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
}
