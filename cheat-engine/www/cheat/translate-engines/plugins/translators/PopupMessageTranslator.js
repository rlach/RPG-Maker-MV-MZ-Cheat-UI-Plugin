import { BasePluginTranslator } from '../BasePluginTranslator.js';

/*
 * PopupMessage (Yana) translator.
 *
 * Supported versions:
 * - MV v1.02
 *
 * Translation notes:
 * - PopupMessage strips _pum[...] control markers before rendering popup text.
 * - Existing mass translation often stores keys with the full marker prefix
 *   (for example: _pum[0,0,700,0,Normal] 1000ゴールド).
 * - Runtime hook point is CommonPopupManager.startPopupMessage, where we
 *   reconstruct the marker-prefixed source key, resolve cache translation,
 *   then strip marker syntax before display so plugin behavior remains intact.
 */

const POPUP_MARKER_REGEX = /_PUM\[(\d+),?(\d+)?,?(\d+)?,?(\d+)?,?(.+?)?\]/gi;

function normalizePopupArgNumber(value, fallback) {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizePopupPattern(value) {
    const text = String(value || '').trim();
    return text || 'Normal';
}

function buildPopupSourcePrefix(arg) {
    const popupArg = Array.isArray(arg) ? arg : [];
    const delay = normalizePopupArgNumber(popupArg[0], 0);
    const x = normalizePopupArgNumber(popupArg[1], 0);
    const y = normalizePopupArgNumber(popupArg[2], 0);
    const action = normalizePopupArgNumber(popupArg[3], 0);
    const pattern = normalizePopupPattern(popupArg[4]);
    return `_pum[${delay},${x},${y},${action},${pattern}]`;
}

function stripPopupMarker(text) {
    if (typeof text !== 'string') {
        return text;
    }

    return text.replaceAll(POPUP_MARKER_REGEX, '').trimStart();
}

function buildPopupSourceText(prefix, text) {
    const payload = String(text || '');
    return `${prefix} ${payload}`.trim();
}

export class PopupMessageTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'PopupMessage';
    }

    getPluginLabel() {
        return 'PopupMessage';
    }

    enablePluginTranslation() {
        if (
            !window.CommonPopupManager ||
            typeof CommonPopupManager.startPopupMessage !== 'function'
        ) {
            return false;
        }

        const originalStartPopupMessage = CommonPopupManager.startPopupMessage;

        CommonPopupManager.startPopupMessage = ((pluginTranslator) => {
            return function (params, texts, arg) {
                const runtime = pluginTranslator.getRuntime();
                if (!pluginTranslator.isRuntimeTranslationActive(runtime)) {
                    return originalStartPopupMessage.apply(this, arguments);
                }

                if (!Array.isArray(texts) || texts.length === 0) {
                    return originalStartPopupMessage.apply(this, arguments);
                }

                const prefix = buildPopupSourcePrefix(arg);
                let changed = false;
                const translatedTexts = texts.map((line) => {
                    let sourceText = buildPopupSourceText(prefix, line);
                    if (!pluginTranslator.isUsableText(sourceText)) {
                        return line;
                    }
                    sourceText = sourceText.replace(/\] {2}/, '] '); // Normalize double spaces after marker to single space for better cache hits

                    let translated = pluginTranslator.resolveRuntimeTranslation(
                        sourceText,
                        runtime,
                        ['message', 'message_portrait'],
                        {
                            requireRuntimeTranslationActive: true,
                            missValue: sourceText,
                        }
                    );

                    if (!pluginTranslator.isUsableText(translated) || translated === sourceText) {
                        return line;
                    }

                    const popupText = stripPopupMarker(translated);
                    if (!pluginTranslator.isUsableText(popupText)) {
                        return line;
                    }

                    if (popupText !== line) {
                        changed = true;
                    }

                    return popupText;
                });

                if (!changed) {
                    return originalStartPopupMessage.apply(this, arguments);
                }

                return originalStartPopupMessage.call(this, params, translatedTexts, arg);
            };
        })(this);

        return true;
    }

    async precomputeCounts() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
