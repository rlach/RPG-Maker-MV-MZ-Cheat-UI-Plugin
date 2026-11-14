import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';
import { parseCsvTable } from './TranslatorHelpers.js';

/** WafuFormationScreenMV (MV, unversioned). Parameter vocabulary and source labels,
 * including the RJ01547841 status/equipment fork. Scene classes are closure-private;
 * their inherited text drawing/measurement resolves only cataloged display strings.
 */
export class WafuFormationScreenTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'WafuFormationScreenMV';
    }
    getCacheType() {
        return 'plugin_wafu_formation_screen';
    }
    getParameterTextPattern() {
        return /^(?:CommandName|HpLabel|ResistTitleLabel|StateResistTitleLabel|ProfileTitleLabel)$/;
    }
    isDisplayFragment() {
        return false;
    }
    collectParameterTexts(parameters) {
        super.collectParameterTexts(parameters);
        for (const field of [
            'ElementLabels',
            'StateLabels',
            'HeaderLabels',
            'ExpLabels',
            'ParamLabels',
        ]) {
            for (const text of parseCsvTable(parameters?.[field] || '')[0] || []) {
                if (!this.isUsableText(text)) continue;
                this.entries.set(text, { text });
                if (field === 'ExpLabels')
                    this.entries.set(text + '\\COT[0]', {
                        text: text + '\\COT[0]',
                        parts: [text, ''],
                    });
            }
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_Base?.prototype;
        if (
            typeof prototype?.drawText !== 'function' ||
            typeof prototype?.drawTextEx !== 'function' ||
            typeof prototype?.textWidth !== 'function'
        )
            return false;
        for (const method of ['drawText', 'drawTextEx', 'textWidth'])
            this.hookDrawing(prototype, method);
        this.precomputeCounts().catch((error) =>
            console.error('[WafuFormationScreenTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
