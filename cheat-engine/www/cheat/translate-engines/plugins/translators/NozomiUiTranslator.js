import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * RJ01284200 v1.0.0 (MZ): game-authored CBR_menu, CBR_save and CBR_evReco.
 * Catalogs display literals/templates and the custom quest table. Render hooks
 * preserve variable expressions, quest identifiers and save metadata.
 */
export class NozomiUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'CBR_menu';
    }
    getPluginLabel() {
        return 'Nozomi menu and quests';
    }
    getPluginAliases() {
        return ['CBR_menu', 'CBR_save', 'CBR_evReco'];
    }
    detectPlugin() {
        return ['CBR_menu', 'CBR_evReco'].every(
            (name) => this.findPluginEntry(name)?.status === true
        );
    }
    enablePluginTranslation() {
        const prototypes = [
            window.Window_MenuStatus?.prototype,
            window.Window_Info?.prototype,
            window.Window_evList?.prototype,
            window.Window_EvText?.prototype,
            window.Window_evCategory?.prototype,
        ];
        const methods = ['drawText', 'drawTextEx', 'textWidth', 'textSizeEx'];
        if (
            prototypes.some((prototype) =>
                methods.some((method) => typeof prototype?.[method] !== 'function')
            )
        )
            return false;
        for (const prototype of prototypes) {
            for (const method of methods) this.hookDrawing(prototype, method);
        }
        this.precomputeCounts().catch((error) =>
            console.error('[NozomiUiTranslator] Catalog scan failed', error)
        );
        return true;
    }
    getCacheType() {
        return 'plugin_nozomi_ui';
    }
    shouldScanEventData() {
        return false;
    }
    async collectAdditionalTexts() {
        if (!this.findPluginEntry('CBR_evReco')?.status) return;
        let rows = window.CBR_evRecos;
        if (!Array.isArray(rows)) {
            const response = await fetch('data/CBR_eventList.json');
            if (!response.ok) throw new Error(`Cannot read CBR_eventList: ${response.status}`);
            rows = parseJsonSafely(await response.text(), []);
        }
        if (!Array.isArray(rows)) throw new Error('Invalid CBR_eventList table');
        for (const row of rows) {
            for (const field of ['title', 'type', 'place', 'text']) {
                const text = row?.[field];
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
}
