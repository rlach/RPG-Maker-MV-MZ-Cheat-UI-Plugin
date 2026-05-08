import { BasePluginTranslator } from '../BasePluginTranslator.js';

const RUNTIME_HOOK_GUARD = '__CHEAT_MESSAGE_WINDOW_POPUP_TRANSLATOR_HOOKED__';
const CACHE_TYPE = 'plugin_message_window_popup';
const DEBUG_LOG = true;
const WIDTH_OVERRIDE_EXTRA_PX = 10;

function getTranslatedMessageTextForPopupSizing(runtime, originalText, options = {}) {
    if (typeof originalText !== 'string' || !originalText.trim()) {
        return null;
    }

    if (
        !runtime ||
        typeof runtime.getPreferredMessageCacheEntry !== 'function'
    ) {
        return null;
    }

    const preferred = runtime.getPreferredMessageCacheEntry(originalText, options);
    const cached = preferred ? preferred.value : null;
    if (typeof cached !== 'string' || !cached.trim()) {
        return null;
    }

    return cached;
}

function resolveMeasuredPopupText(runtime, originalText, currentText, options = {}) {
    const fromOriginal = getTranslatedMessageTextForPopupSizing(runtime, originalText, options);
    const hasSameCurrentText = originalText === currentText;
    const fromCurrent = hasSameCurrentText
        ? null
        : getTranslatedMessageTextForPopupSizing(runtime, currentText, options);

    if (typeof fromOriginal === 'string' && fromOriginal.trim()) {
        return {
            measuredText: fromOriginal,
            source: 'cache(original)',
        };
    }

    if (typeof fromCurrent === 'string' && fromCurrent.trim()) {
        return {
            measuredText: fromCurrent,
            source: 'cache(current)',
        };
    }

    return {
        measuredText: currentText,
        source: 'current',
    };
}

function debugLog(message, payload) {
    if (!DEBUG_LOG) {
        return;
    }

    if (payload !== undefined) {
        console.warn(`[MessageWindowPopupTranslator] ${message}`, payload);
        return;
    }

    console.warn(`[MessageWindowPopupTranslator] ${message}`);
}

function computeDesiredPopupWidth(windowMessage, measuredText) {
    if (!windowMessage || typeof measuredText !== 'string') {
        return 0;
    }

    const text = windowMessage.convertEscapeCharacters(measuredText || '');
    const virtual = windowMessage.createTextState(text, 0, 0, 0);
    virtual.drawing = false;
    virtual.startX = windowMessage.newLineX();
    windowMessage.newPage(virtual);
    windowMessage.processAllText(virtual);
    virtual.outputWidth += virtual.startX;

    const outlineWidth = Number(windowMessage.contents?.outlineWidth || 0);
    const safetyInnerPadding = outlineWidth * 2 + 16;
    return Math.ceil(
        virtual.outputWidth +
            safetyInnerPadding +
            windowMessage.padding * 2 +
            WIDTH_OVERRIDE_EXTRA_PX
    );
}

function limitPopupHeightToFirstPage(windowMessage) {
    const faceHeight = windowMessage.getFaceHeight();
    const lineHeight = windowMessage.itemHeight();
    const padding = windowMessage.padding;
    const firstPageHeight = Math.max(faceHeight, lineHeight * 4) + padding * 2;
    if (windowMessage.height > firstPageHeight) {
        windowMessage.height = firstPageHeight;
    }
}

export class MessageWindowPopupTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MessageWindowPopup';
    }

    getPluginLabel() {
        return 'MessageWindowPopup';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    enablePluginTranslation() {
        const translator = this;

        if (window[RUNTIME_HOOK_GUARD]) {
            return;
        }

        if (
            !window.Window_Message ||
            !Window_Message.prototype ||
            typeof Window_Message.prototype.resizeForPopup !== 'function'
        ) {
            debugLog('Skipped hook install: Window_Message.resizeForPopup is missing');
            return;
        }

        debugLog('Installing hooks');
        const originalResizeForPopup = Window_Message.prototype.resizeForPopup;

        Window_Message.prototype.resizeForPopup = function () {
            const runtime = translator.getRuntime();
            const currentText =
                typeof $gameMessage?.allText === 'function'
                    ? String($gameMessage.allText() || '')
                    : '';
            const originalTextForCache =
                typeof $gameMessage?._translateOriginalText === 'string' &&
                $gameMessage._translateOriginalText.trim()
                    ? $gameMessage._translateOriginalText
                    : currentText;

            const popupSizingEnabled = translator.isRuntimeTranslationActive(runtime);
            if (!popupSizingEnabled) {
                originalResizeForPopup.apply(this, arguments);
                debugLog('resizeForPopup(skip-disabled)', {
                    width: this.width,
                    height: this.height,
                    currentText,
                });
                return;
            }

            const hasPortrait =
                typeof runtime?.hasCurrentMessagePortrait === 'function'
                    ? runtime.hasCurrentMessagePortrait($gameMessage)
                    : false;
            const { measuredText, source } = resolveMeasuredPopupText(
                runtime,
                originalTextForCache,
                currentText,
                { hasPortrait }
            );

            const originalTexts = Array.isArray($gameMessage?._texts)
                ? $gameMessage._texts.slice()
                : null;
            const hasTextSwap =
                originalTexts &&
                typeof measuredText === 'string' &&
                measuredText.trim() &&
                measuredText !== currentText;

            // Run the plugin's native math, but on translated lines when available.
            if (hasTextSwap) {
                $gameMessage._texts.length = 0;
                for (const line of measuredText.split('\n')) {
                    $gameMessage._texts.push(line);
                }
            }

            try {
                originalResizeForPopup.apply(this, arguments);
            } finally {
                if (hasTextSwap) {
                    $gameMessage._texts.length = 0;
                    for (const line of originalTexts) {
                        $gameMessage._texts.push(line);
                    }
                }
            }

            // Limit height to first page only (popups show 4 lines max, not all text lines).
            limitPopupHeightToFirstPage(this);

            // Safety expansion: add a small buffer for outline/shadow edge clipping.
            const probeText = this.convertEscapeCharacters(measuredText || currentText);
            const probe = this.createTextState(probeText, 0, 0, 0);
            probe.drawing = false;
            probe.startX = this.newLineX();
            this.newPage(probe);
            this.processAllText(probe);
            probe.outputWidth += probe.startX;

            const outlineWidth = Number(this.contents?.outlineWidth || 0);
            const safetyInnerPadding = outlineWidth * 2 + 8;
            const desiredWidth = Math.ceil(
                probe.outputWidth + safetyInnerPadding + this.padding * 2 + WIDTH_OVERRIDE_EXTRA_PX
            );
            if (desiredWidth > this.width) {
                this.width = desiredWidth;
                if (this._windowRect) {
                    this._windowRect.width = this.width;
                }
            }

            debugLog('resizeForPopup', {
                source,
                originalTextForCache,
                currentText,
                measuredText,
                width: this.width,
                height: this.height,
                outputWidth: probe.outputWidth,
                startX: probe.startX,
                outlineWidth,
                safetyInnerPadding,
                desiredWidth,
            });
        };

        const originalResetLayout = Window_Message.prototype.resetLayout;
        Window_Message.prototype.resetLayout = function () {
            originalResetLayout.apply(this, arguments);

            if (!this.getPopupTargetCharacter?.()) {
                return;
            }

            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime)) {
                return;
            }

            const currentText =
                typeof $gameMessage?.allText === 'function'
                    ? String($gameMessage.allText() || '')
                    : '';
            const originalTextForCache =
                typeof $gameMessage?._translateOriginalText === 'string' &&
                $gameMessage._translateOriginalText.trim()
                    ? $gameMessage._translateOriginalText
                    : currentText;
            const hasPortrait = runtime?.hasCurrentMessagePortrait($gameMessage) || false;
            const { measuredText, source } = resolveMeasuredPopupText(
                runtime,
                originalTextForCache,
                currentText,
                { hasPortrait }
            );

            const desiredWidth = computeDesiredPopupWidth(this, measuredText);
            if (!desiredWidth || desiredWidth <= this.width) {
                debugLog('resetLayout(no-expand)', {
                    source,
                    currentWidth: this.width,
                    desiredWidth,
                    measuredText,
                });
                return;
            }

            this.width = desiredWidth;
            if (this._windowRect) {
                this._windowRect.width = this.width;
            }
            this.updatePlacement();

            debugLog('resetLayout(expand)', {
                source,
                currentText,
                originalTextForCache,
                measuredText,
                desiredWidth,
                finalWidth: this.width,
            });
        };

        if (typeof Window_Base?.prototype?.setPopupBasePosition === 'function') {
            const originalSetPopupBasePosition = Window_Base.prototype.setPopupBasePosition;

            Window_Base.prototype.setPopupBasePosition = function () {
                originalSetPopupBasePosition.apply(this, arguments);

                if (!DEBUG_LOG) {
                    return;
                }

                try {
                    debugLog('setPopupBasePosition', {
                        x: this.x,
                        y: this.y,
                        width: this.width,
                        height: this.height,
                        popupBaseX: this.getPopupBaseX?.() ?? null,
                        popupBaseY: this.getPopupBaseY?.() ?? null,
                        popupLeftX: this.findPopupLeftX?.() ?? null,
                    });
                } catch (error) {
                    console.warn(
                        '[MessageWindowPopupTranslator] Failed to log popup base position',
                        error
                    );
                }
            };
        }

        window[RUNTIME_HOOK_GUARD] = true;
    }

    async prepareTranslator() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    countPluginAmountSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
