import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseStructArraySafely } from './TranslatorHelpers.js';

/**
 * RecollectionRoom.js (MV)
 *
 * Translates locked scene hint messages (DefaultLockedMessage and per-item HintText)
 * and fallback text buttons ("部屋に戻る", "全開放") in Scene_RecollectionRoom.
 */
export class RecollectionRoomTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'RecollectionRoom';
    }

    getPluginLabel() {
        return 'Recollection Room';
    }

    getCacheType() {
        return 'plugin_recollection_room';
    }

    shouldScanEventData() {
        return false;
    }

    collectParameterTexts(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return;
        }

        const defaultLockedMsg = String(parameters.DefaultLockedMessage || '').trim();
        if (this.isUsableText(defaultLockedMsg)) {
            this.entries.set(defaultLockedMsg, { text: defaultLockedMsg });
        }

        for (const item of parseStructArraySafely(parameters.Items)) {
            const hintText = String(item?.HintText || '').trim();
            if (this.isUsableText(hintText)) {
                this.entries.set(hintText, { text: hintText });
            }
        }
    }
}
