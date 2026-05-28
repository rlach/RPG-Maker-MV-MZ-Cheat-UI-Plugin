import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * NRP_MessageWindow translator
 *
 * Supported plugin versions:
 * - NRP_MessageWindow.js v1.01 (MV/MZ)
 *
 * Translation notes:
 * - This plugin does not add user-facing text of its own.
 * - Runtime hook rounds calculated message-window heights up to the next full
 *   fittingHeight row so custom formulas stay aligned to line boundaries.
 */

const PLUGIN_NAME = 'NRP_MessageWindow';
const CACHE_TYPE = 'plugin_nrp_message_window';
const HOOK_FLAG = '__CHEAT_NRP_MESSAGE_WINDOW_PATCHED__';

export class NRP_MessageWindowTranslator extends BasePluginTranslator {
    getPluginName() {
        return PLUGIN_NAME;
    }

    getPluginLabel() {
        return 'NRP MessageWindow';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }

    enablePluginTranslation() {
        const messageProto = window.Window_Message?.prototype;
        if (!messageProto || typeof messageProto.calcWindowHeight !== 'function') {
            return false;
        }

        if (messageProto[HOOK_FLAG]) {
            return true;
        }

        const originalCalcWindowHeight = messageProto.calcWindowHeight;

        messageProto.calcWindowHeight = function () {
            const rawHeight = originalCalcWindowHeight.apply(this, arguments);
            const numericHeight = Number(rawHeight);
            if (!Number.isFinite(numericHeight) || numericHeight <= 0) {
                return rawHeight;
            }

            const lineHeight = Number(this.lineHeight?.()) || 0;
            const padding = Number(this.standardPadding?.()) || 0;
            if (lineHeight <= 0) {
                return rawHeight;
            }

            const usableHeight = Math.max(0, numericHeight - padding * 2);
            const lineCount = Math.max(1, Math.ceil(usableHeight / lineHeight));
            return this.fittingHeight(lineCount);
        };

        Object.defineProperty(messageProto, HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }
}