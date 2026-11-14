import { ParameterSourceCatalogTranslator } from '../ParameterSourceCatalogTranslator.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/**
 * FesStyleConfirm v1.1.1 (MZ), including the RJ01284200 game-close prompt.
 * Catalogs nested terms, plugin-command prompts and source labels. The complete
 * confirmation message is translated before centering and line measurement.
 */
export class FesStyleConfirmTranslator extends ParameterSourceCatalogTranslator {
    getPluginName() {
        return 'FesStyleConfirm';
    }
    getCacheType() {
        return 'plugin_fes_style_confirm';
    }
    getParameterTextPattern() {
        return /(?:^|\/)(?:saveConfirm|overwriteConfirm|loadConfirm|removeConfirm|gameEndConfirm|ok|cancel)$/;
    }
    shouldScanEventData() {
        return true;
    }
    collectMapTexts() {}
    collectCommandTexts(list = []) {
        for (const command of list || []) {
            const params = command.parameters;
            if (
                command.code !== 357 ||
                params[0]?.split('/').pop() !== this.getPluginName() ||
                !['showConfirm', 'showAlert'].includes(params[1])
            )
                continue;
            const args = params[3];
            for (const field of ['text', 'ok', 'cancel']) {
                const text =
                    field === 'text' ? parseJsonSafely(args?.text, args?.text) : args?.[field];
                if (this.isUsableText(text)) this.entries.set(text, { text });
            }
        }
    }
    enablePluginTranslation() {
        const prototype = window.Window_Confirm?.prototype;
        if (
            typeof prototype?.getMessage !== 'function' ||
            typeof prototype?.drawText !== 'function'
        )
            return false;
        const original = prototype.getMessage;
        const translator = this;
        prototype.getMessage = function (...args) {
            return translator.resolveText(original.apply(this, args), translator.getRuntime());
        };
        this.hookDrawing(prototype, 'drawText');
        this.precomputeCounts().catch((error) =>
            console.error('[FesStyleConfirmTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
