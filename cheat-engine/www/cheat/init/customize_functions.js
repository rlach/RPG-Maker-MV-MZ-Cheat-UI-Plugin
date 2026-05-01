// customize mv functions
import { MessageCheat } from '../js/CheatHelper.js';

export function customizeRPGMakerFunctions(mainComponent) {
    if (window.__CHEAT_EXTERNAL_WINDOW__) {
        // return
    }

    if (window.__CHEAT_TOUCHINPUT_CUSTOMIZED__) {
        return;
    }

    if (
        !window.TouchInput ||
        typeof TouchInput._onWheel !== 'function' ||
        typeof TouchInput._onMouseDown !== 'function'
    ) {
        console.log('TouchInput not ready yet, retrying customizeRPGMakerFunctions in 500ms...');
        setTimeout(() => customizeRPGMakerFunctions(mainComponent), 500);
        return;
    }

    const CHEAT_UI_SELECTOR =
        '#cheat-modal, #tof-progress-box, .object-translation-dialog .v-card, .object-translation-map-events-dialog .v-card, .object-translation-plugins-dialog .v-card';

    const getEventTargetElement = (event) => {
        if (!event) {
            return null;
        }

        const target = event.target;
        if (!target) {
            return null;
        }

        if (typeof target.closest === 'function') {
            return target;
        }

        return target.parentElement || null;
    };

    const isEventFromCheatUi = (event) => {
        const targetEl = getEventTargetElement(event);
        return !!(
            targetEl &&
            typeof targetEl.closest === 'function' &&
            targetEl.closest(CHEAT_UI_SELECTOR)
        );
    };

    const isMouseInsideUiInputBlock = (event) => {
        if (!isEventFromCheatUi(event)) {
            return false;
        }

        const targetEl = getEventTargetElement(event);
        if (!targetEl || typeof targetEl.closest !== 'function') {
            return true;
        }

        if (targetEl.closest('#tof-progress-box')) {
            return Number(event.button) === 0;
        }

        return true;
    };

    const isObjectTranslationModalOpen = () =>
        !!document.querySelector(
            '.object-translation-dialog.v-dialog__content--active, .object-translation-map-events-dialog.v-dialog__content--active, .object-translation-plugins-dialog.v-dialog__content--active'
        );

    const addWheelDelta = (touchInput, event) => {
        if (touchInput._newState) {
            touchInput._newState.wheelX += event.deltaX;
            touchInput._newState.wheelY += event.deltaY;
            return;
        }

        if (touchInput._events) {
            touchInput._events.wheelX += event.deltaX;
            touchInput._events.wheelY += event.deltaY;
        }
    };

    // WARN: directly changing engine code can be dangerous
    // remove preventDefault for game wheel events and let Vue UI consume wheel over cheat modal.
    TouchInput._onWheel = function (event) {
        if (!event || isEventFromCheatUi(event)) {
            return;
        }

        addWheelDelta(this, event);
    };

    // Ignore click input routed to the game when pointer is inside cheat UI.
    const TouchInput_onMouseDown = TouchInput._onMouseDown;
    TouchInput._onMouseDown = function (event) {
        if (isMouseInsideUiInputBlock(event)) {
            return;
        }

        TouchInput_onMouseDown.call(this, event);
    };

    if (window.Input && typeof window.Input._onKeyDown === 'function') {
        const Input_onKeyDown = Input._onKeyDown;
        Input._onKeyDown = function (event) {
            if (isObjectTranslationModalOpen()) {
                return;
            }

            Input_onKeyDown.call(this, event);
        };
    }

    if (window.Input && typeof window.Input._onKeyUp === 'function') {
        const Input_onKeyUp = Input._onKeyUp;
        Input._onKeyUp = function (event) {
            if (isObjectTranslationModalOpen()) {
                return;
            }

            Input_onKeyUp.call(this, event);
        };
    }

    window.__CHEAT_TOUCHINPUT_CUSTOMIZED__ = true;
    MessageCheat.initialize();
}
