// customize mv functions
import { MessageCheat } from "../js/CheatHelper.js";
import { isRpgMakerMv, getRpgMakerName } from "../js/RpgMakerRuntime.js";

export function customizeRPGMakerFunctions(mainComponent) {
  if (window.__CHEAT_EXTERNAL_WINDOW__) {
    // return
  }

  const rpgMakerName = getRpgMakerName();
  if (!rpgMakerName) {
    console.log(
      "Engine not ready yet, retrying customizeRPGMakerFunctions in 1 second...",
    );
    setTimeout(() => customizeRPGMakerFunctions(mainComponent), 1000);
    return;
  }

  if (
    !window.TouchInput ||
    typeof TouchInput._onWheel !== "function" ||
    typeof TouchInput._onMouseDown !== "function"
  ) {
    console.log(
      "TouchInput not ready yet, retrying customizeRPGMakerFunctions in 500ms...",
    );
    setTimeout(() => customizeRPGMakerFunctions(mainComponent), 500);
    return;
  }

  const getUiInputBlocks = () => {
    const blocks = [
      document.querySelector("#cheat-modal"),
      document.querySelector("#tof-progress-box"),
      ...Array.from(
        document.querySelectorAll(
          ".object-translation-dialog .v-card, .object-translation-map-events-dialog .v-card, .object-translation-plugins-dialog .v-card",
        ),
      ),
    ].filter(Boolean);
    return blocks;
  };

  const isMouseInsideUiInputBlock = (event) => {
    const blocks = getUiInputBlocks();
    const progressBox = document.querySelector("#tof-progress-box");
    for (const block of blocks) {
      const bcr = block.getBoundingClientRect();
      if (
        bcr.left <= event.clientX &&
        event.clientX <= bcr.left + bcr.width &&
        bcr.top <= event.clientY &&
        event.clientY <= bcr.top + bcr.height
      ) {
        if (progressBox && block === progressBox) {
          return Number(event.button) === 0;
        }

        return true;
      }
    }

    return false;
  };

  const isObjectTranslationModalOpen = () =>
    !!document.querySelector(
      ".object-translation-dialog.v-dialog__content--active, .object-translation-map-events-dialog.v-dialog__content--active, .object-translation-plugins-dialog.v-dialog__content--active",
    );

  if (isRpgMakerMv()) {
    // WARN: directly changing engine code can be dangerous
    // remove preventDefault
    TouchInput._onWheel = function (event) {
      if (!event || isMouseInsideUiInputBlock(event)) {
        return;
      }

      this._events.wheelX += event.deltaX;
      this._events.wheelY += event.deltaY;
    };

    // Ignore click input routed to the game when pointer is inside cheat UI.
    const TouchInput_onMouseDown = TouchInput._onMouseDown;
    TouchInput._onMouseDown = function (event) {
      if (isMouseInsideUiInputBlock(event)) {
        return;
      }

      TouchInput_onMouseDown.call(this, event);
    };
  } else {
    // MZ Settings
    // WARN: directly changing engine code can be dangerous
    // remove preventDefault
    TouchInput._onWheel = function (event) {
      if (!event || isMouseInsideUiInputBlock(event)) {
        return;
      }

      this._newState.wheelX += event.deltaX;
      this._newState.wheelY += event.deltaY;
    };

    // Ignore click input routed to the game when pointer is inside cheat UI.
    const TouchInput_onMouseDown = TouchInput._onMouseDown;
    TouchInput._onMouseDown = function (event) {
      if (isMouseInsideUiInputBlock(event)) {
        return;
      }

      TouchInput_onMouseDown.call(this, event);
    };
  }

  if (window.Input && typeof window.Input._onKeyDown === "function") {
    const Input_onKeyDown = Input._onKeyDown;
    Input._onKeyDown = function (event) {
      if (isObjectTranslationModalOpen()) {
        return;
      }

      Input_onKeyDown.call(this, event);
    };
  }

  if (window.Input && typeof window.Input._onKeyUp === "function") {
    const Input_onKeyUp = Input._onKeyUp;
    Input._onKeyUp = function (event) {
      if (isObjectTranslationModalOpen()) {
        return;
      }

      Input_onKeyUp.call(this, event);
    };
  }

  MessageCheat.initialize();
}
