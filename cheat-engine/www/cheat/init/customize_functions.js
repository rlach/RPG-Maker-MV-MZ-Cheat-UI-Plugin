// customize mv functions
import { MessageCheat } from '../js/CheatHelper.js';
import { shouldApplyHook } from '../js/HookGuardHelper.js';

const TOUCHINPUT_HOOK_NAME = 'CHEAT_TOUCHINPUT_CUSTOMIZE_HOOK';

export function customizeRPGMakerFunctions(mainComponent) {
    if (window.__CHEAT_EXTERNAL_WINDOW__) {
        return;
    }

    if (!shouldApplyHook(TOUCHINPUT_HOOK_NAME)) {
        return;
    }

    if (window.__CHEAT_TOUCHINPUT_CUSTOMIZED__) {
        return;
    }

    const CHEAT_WINDOW_SELECTOR =
        '#cheat-modal, .v-dialog__content--active .cheat-confirm-dialog, .v-dialog__content--active .object-translation-dialog, .v-dialog__content--active .object-translation-map-events-dialog, .v-dialog__content--active .object-translation-plugins-dialog';
    const CHEAT_UI_EVENT_SELECTOR =
        '#cheat-modal, #tof-progress-box, .cheat-confirm-dialog, .cheat-confirm-dialog .v-card, .object-translation-dialog, .object-translation-dialog .v-card, .object-translation-map-events-dialog, .object-translation-map-events-dialog .v-card, .object-translation-plugins-dialog, .object-translation-plugins-dialog .v-card';

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
            targetEl.closest(CHEAT_UI_EVENT_SELECTOR)
        );
    };

    const isEventFromProgressBox = (event) => {
        const targetEl = getEventTargetElement(event);
        return !!(
            targetEl &&
            typeof targetEl.closest === 'function' &&
            targetEl.closest('#tof-progress-box')
        );
    };

    const isCheatWindowVisible = () => {
        if (mainComponent && mainComponent.show) {
            return true;
        }

        return !!document.querySelector(CHEAT_WINDOW_SELECTOR);
    };

    let inputReleasedForBlockingSession = false;

    const releaseGameInputStateOnceForBlockingSession = () => {
        const isBlockingActive = isCheatWindowVisible();
        if (!isBlockingActive) {
            inputReleasedForBlockingSession = false;
            return false;
        }

        if (inputReleasedForBlockingSession) {
            return true;
        }

        if (window.Input && typeof window.Input.clear === 'function') {
            window.Input.clear();
        }

        if (window.TouchInput && typeof window.TouchInput.clear === 'function') {
            window.TouchInput.clear();
        }

        inputReleasedForBlockingSession = true;
        return true;
    };

    const isMouseInsideUiInputBlock = (event) => {
        if (releaseGameInputStateOnceForBlockingSession()) {
            return true;
        }

        if (isEventFromProgressBox(event)) {
            return Number(event.button) === 0;
        }

        return isEventFromCheatUi(event);
    };

    // -------------------------------------------------------------------------
    // PRIMARY FIX: Patch update() methods (race-condition proof).
    //
    // RPG Maker registers event listeners via .bind(), capturing the function
    // reference at registration time. If our script loads AFTER _setupEventHandlers,
    // patching _onWheel/_onMouseDown has no effect on the already-bound listeners.
    //
    // However, TouchInput.update() and Input.update() are called by the game loop
    // each frame via direct method resolution (no .bind()). Patching them ALWAYS
    // works regardless of initialization order.
    //
    // When the cheat UI is active, we clear all input state in update() so the
    // game logic never sees any input — even if the bound handlers already wrote
    // dirty state between frames.
    // -------------------------------------------------------------------------

    const installUpdatePatches = () => {
        if (window.TouchInput && typeof TouchInput.update === 'function' && !TouchInput.__cheat_originalUpdate) {
            TouchInput.__cheat_originalUpdate = TouchInput.update;
            TouchInput.update = function () {
                if (isCheatWindowVisible()) {
                    // Wipe any state accumulated by bound event handlers between frames.
                    if (typeof this.clear === 'function') {
                        this.clear();
                    }
                    return;
                }
                TouchInput.__cheat_originalUpdate.call(this);
            };
        }

        if (window.Input && typeof Input.update === 'function' && !Input.__cheat_originalUpdate) {
            Input.__cheat_originalUpdate = Input.update;
            Input.update = function () {
                if (isCheatWindowVisible()) {
                    if (typeof this.clear === 'function') {
                        this.clear();
                    }
                    return;
                }
                Input.__cheat_originalUpdate.call(this);
            };
        }
    };

    // Try immediately; retry if Input/TouchInput not yet available.
    const ensureUpdatePatches = () => {
        installUpdatePatches();

        const touchPatched = window.TouchInput && TouchInput.__cheat_originalUpdate;
        const inputPatched = window.Input && Input.__cheat_originalUpdate;

        if (!touchPatched || !inputPatched) {
            setTimeout(ensureUpdatePatches, 200);
        }
    };

    ensureUpdatePatches();

    // -------------------------------------------------------------------------
    // SECONDARY: Patch event handler methods directly (works when no race).
    //
    // When our code patches _onWheel/_onMouseDown BEFORE _setupEventHandlers
    // runs, the .bind() captures our patched version. This provides cleaner
    // behavior (events never even reach the game handler) in the common case.
    // If the race occurs, the PRIMARY fix (update patch) catches it.
    // -------------------------------------------------------------------------

    const installMethodPatches = () => {
        if (
            !window.TouchInput ||
            typeof TouchInput._onWheel !== 'function' ||
            typeof TouchInput._onMouseDown !== 'function'
        ) {
            setTimeout(installMethodPatches, 500);
            return;
        }

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

        // Keep wheel behavior centralized: when a real cheat window is visible, never forward wheel to game.
        TouchInput._onWheel = function (event) {
            if (!event || releaseGameInputStateOnceForBlockingSession()) {
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
                if (releaseGameInputStateOnceForBlockingSession()) {
                    return;
                }

                Input_onKeyDown.call(this, event);
            };
        }

        if (window.Input && typeof window.Input._onKeyUp === 'function') {
            const Input_onKeyUp = Input._onKeyUp;
            Input._onKeyUp = function (event) {
                if (releaseGameInputStateOnceForBlockingSession()) {
                    return;
                }

                Input_onKeyUp.call(this, event);
            };
        }
    };

    installMethodPatches();

    window.__CHEAT_TOUCHINPUT_CUSTOMIZED__ = true;
    MessageCheat.initialize();
}
