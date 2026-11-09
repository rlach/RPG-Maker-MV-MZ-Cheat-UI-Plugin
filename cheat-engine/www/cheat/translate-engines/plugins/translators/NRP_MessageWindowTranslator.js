import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * NRP_MessageWindow translator
 *
 * Supported plugin versions:
 * - NRP_MessageWindow.js v1.01 (MV/MZ)
 * - NRP_MessageWindow.js v1.045 (MZ), portable text and window offsets
 *
 * Translation notes:
 * - This plugin does not add user-facing text of its own.
 * - Runtime hook rounds calculated message-window heights up to the next full
 *   fittingHeight row so custom formulas stay aligned to line boundaries.
 * - MZ text offsets move the shared client layer and its clipping rectangle,
 *   including MPP_MessageEX animated glyphs. MV offsets include its animation container.
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

    getSettingsSchema() {
        return [
            {
                key: 'maxLinesPerPage',
                label: 'Maximum lines per message page (0 = plugin default)',
                type: 'number',
                default: 0,
                min: 0,
                max: 20,
                step: 1,
            },
            {
                key: 'textOffsetX',
                label: 'Text horizontal offset (px)',
                type: 'number',
                default: 0,
                min: -2048,
                max: 2048,
                step: 1,
            },
            {
                key: 'textOffsetY',
                label: 'Text vertical offset (px)',
                type: 'number',
                default: 0,
                min: -2048,
                max: 2048,
                step: 1,
            },
            {
                key: 'windowOffsetY',
                label: 'Window vertical offset (px)',
                type: 'number',
                default: 0,
                min: -2048,
                max: 2048,
                step: 1,
            },
        ];
    }

    onPluginSettingsChanged() {
        window.SceneManager?._scene?._messageWindow?.updatePlacement();
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
            const lineHeight = Number(this.lineHeight?.()) || 0;
            const floredLineCount = Math.max(1, Math.floor(rawHeight / lineHeight));
            return this.fittingHeight(floredLineCount);
        };

        const translator = this;
        const textSettings = () =>
            translator.isRuntimeTranslationActive() ? translator.getPluginSettings() : {};
        const pageLines = new WeakMap();
        const newPage = messageProto.newPage;
        const processNewLine = messageProto.processNewLine;
        const needsNewPage = messageProto.needsNewPage;
        if (
            typeof newPage === 'function' &&
            typeof processNewLine === 'function' &&
            typeof needsNewPage === 'function'
        ) {
            messageProto.newPage = function (...args) {
                pageLines.set(this, 1);
                return newPage.apply(this, args);
            };
            messageProto.processNewLine = function (...args) {
                // The engine checks pagination inside processNewLine, so count
                // the new line before delegating. Its normal pause resumes the
                // remaining text on a fresh page, including animated glyphs.
                pageLines.set(this, (pageLines.get(this) || 1) + 1);
                return processNewLine.apply(this, args);
            };
            messageProto.needsNewPage = function (textState) {
                const limit = Math.floor(textSettings().maxLinesPerPage || 0);
                return (
                    needsNewPage.apply(this, arguments) ||
                    (limit > 0 && !this.isEndOfText(textState) && pageLines.get(this) > limit)
                );
            };
        }
        const updateClientArea = messageProto._updateClientArea;
        if (typeof updateClientArea === 'function') {
            // MZ animations added with addInnerChild share this container with
            // contents. Its filter area is calculated from the shifted world
            // transform, so negative offsets do not clip the first line/glyphs.
            messageProto._updateClientArea = function (...args) {
                const result = updateClientArea.apply(this, args);
                const settings = textSettings();
                this._clientArea.x += settings.textOffsetX || 0;
                this._clientArea.y += settings.textOffsetY || 0;
                return result;
            };
        }
        const updatePlacement = messageProto.updatePlacement;
        if (typeof updatePlacement === 'function') {
            messageProto.updatePlacement = function (...args) {
                const result = updatePlacement.apply(this, args);
                const settings = textSettings();
                if (typeof updateClientArea === 'function') {
                    this._updateClientArea();
                    this._updateFilterArea();
                } else if (typeof this.contentsSprite === 'function') {
                    // MV has no shared client container. Its contents frame
                    // follows the sprite, and MPP uses a separate container.
                    const sprite = this.contentsSprite();
                    const previous = this._cheatNrpTextOffset;
                    const oldX = previous?.sprite === sprite ? previous.x : 0;
                    const oldY = previous?.sprite === sprite ? previous.y : 0;
                    const x = settings.textOffsetX || 0;
                    const y = settings.textOffsetY || 0;
                    sprite.x += x - oldX;
                    sprite.y += y - oldY;
                    this._cheatNrpTextOffset = { sprite, x, y };
                }
                this.y += settings.windowOffsetY || 0;
                return result;
            };
        }
        const updateCharacterContainer = messageProto.updateCharacterContainer;
        if (typeof updateCharacterContainer === 'function') {
            messageProto.updateCharacterContainer = function (...args) {
                const result = updateCharacterContainer.apply(this, args);
                if (this._characterContainer) {
                    const settings = textSettings();
                    this._characterContainer.x += settings.textOffsetX || 0;
                    this._characterContainer.y += settings.textOffsetY || 0;
                }
                return result;
            };
        }

        Object.defineProperty(messageProto, HOOK_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }
}
