export const translateOnTheFlyUiMethods = {
  getSpinnerHostDocument() {
    // Always prefer the main game window as the host for spinner UI
    const parentDoc =
      window.__CHEAT_EXTERNAL_WINDOW__ && window.opener && !window.opener.closed
        ? window.opener.document
        : null;
    return parentDoc || (typeof document !== "undefined" ? document : null);
  },

  ensureSpinnerElements() {
    const hostDoc = this.getSpinnerHostDocument();
    if (!hostDoc) {
      return null;
    }

    if (!this._spinnerStyle) {
      const existingStyle = hostDoc.getElementById(
        "tof-translate-spinner-style",
      );
      const style = existingStyle || hostDoc.createElement("style");
      style.id = "tof-translate-spinner-style";
      style.textContent = [
        "#tof-translate-spinner { position: fixed; right: 12px; bottom: 12px; width: 48px; height: 48px; display: none; align-items: center; justify-content: center; pointer-events: none; z-index: 9999; }",
        "#tof-translate-spinner .tof-spinner-ring { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.35); border-top: 3px solid #4fc3f7; border-radius: 50%; animation: tof-translate-spin 0.9s linear infinite; box-shadow: 0 0 10px rgba(0,0,0,0.35); background: rgba(0,0,0,0.25); }",
        "@keyframes tof-translate-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }",
      ].join("");
      if (!existingStyle) {
        hostDoc.head.appendChild(style);
      }
      this._spinnerStyle = style;
    }

    if (!this._spinnerEl) {
      const existingEl = hostDoc.getElementById("tof-translate-spinner");
      const el = existingEl || hostDoc.createElement("div");
      el.id = "tof-translate-spinner";
      el.innerHTML = '<div class="tof-spinner-ring"></div>';
      if (!existingEl) {
        hostDoc.body.appendChild(el);
      }
      this._spinnerEl = el;
    }

    return this._spinnerEl;
  },

  ensureProgressBoxElements() {
    const hostDoc = this.getSpinnerHostDocument();
    if (!hostDoc) {
      return null;
    }

    if (!this._progressBoxStyle) {
      const existingStyle = hostDoc.getElementById("tof-progress-box-style");
      const style = existingStyle || hostDoc.createElement("style");
      style.id = "tof-progress-box-style";
      style.textContent = [
        "#tof-progress-box { position: fixed; right: 12px; bottom: 72px; padding: 8px 12px; display: none; background: rgba(50, 50, 50, 0.75); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); pointer-events: none; z-index: 9998; font-family: Arial, sans-serif; text-align: right; }",
        "#tof-progress-box .tof-progress-line { color: #fff; font-size: 12px; line-height: 1.5; margin: 1px 0; white-space: nowrap; }",
        "#tof-progress-box .tof-progress-line.map-progress { font-weight: bold; color: #82d4f8; }",
        "#tof-progress-box .tof-progress-line.message-progress { color: #ccc; }",
        "#tof-progress-box .tof-progress-line.total-errors-progress { color: #ffb3b3; }",
      ].join("");
      if (!existingStyle) {
        hostDoc.head.appendChild(style);
      }
      this._progressBoxStyle = style;
    }

    if (!this._progressBoxEl) {
      const existingEl = hostDoc.getElementById("tof-progress-box");
      const el = existingEl || hostDoc.createElement("div");
      el.id = "tof-progress-box";
      el.innerHTML =
        '<div class="tof-progress-line map-progress" id="tof-map-progress"></div><div class="tof-progress-line message-progress" id="tof-message-progress"></div><div class="tof-progress-line total-errors-progress" id="tof-total-errors-progress"></div>';
      if (!existingEl) {
        hostDoc.body.appendChild(el);
      }
      this._progressBoxEl = el;
    }

    return this._progressBoxEl;
  },

  updateProgressBox(
    mapProgress = null,
    messageProgress = null,
    successes = null,
    failures = null,
    totalErrorsProgress = null,
  ) {
    const el = this.ensureProgressBoxElements();
    if (!el) {
      return;
    }

    const mapProgressEl = el.querySelector("#tof-map-progress");
    const messageProgressEl = el.querySelector("#tof-message-progress");
    const totalErrorsEl = el.querySelector("#tof-total-errors-progress");

    if (mapProgress !== null && mapProgressEl) {
      mapProgressEl.textContent = mapProgress;
      mapProgressEl.style.display = mapProgress ? "block" : "none";
    } else if (mapProgressEl) {
      mapProgressEl.textContent = "";
      mapProgressEl.style.display = "none";
    }

    if (messageProgress !== null && messageProgressEl) {
      let progressText = messageProgress;
      // Add error info if provided and there are failures
      if (successes !== null && failures !== null && failures > 0) {
        progressText += ` (${successes} OK, ${failures} errors)`;
      }
      messageProgressEl.textContent = progressText;
      messageProgressEl.style.display = messageProgress ? "block" : "none";
    } else if (messageProgressEl) {
      messageProgressEl.textContent = "";
      messageProgressEl.style.display = "none";
    }

    if (totalErrorsProgress !== null && totalErrorsEl) {
      totalErrorsEl.textContent = totalErrorsProgress;
      totalErrorsEl.style.display = totalErrorsProgress ? "block" : "none";
    } else if (totalErrorsEl) {
      totalErrorsEl.textContent = "";
      totalErrorsEl.style.display = "none";
    }

    // Show box if any progress is set
    const hasContent =
      (mapProgress && mapProgress.length > 0) ||
      (messageProgress && messageProgress.length > 0) ||
      (totalErrorsProgress && totalErrorsProgress.length > 0);
    el.style.display = hasContent ? "block" : "none";
  },

  hideProgressBox() {
    const el = this.ensureProgressBoxElements();
    if (el) {
      el.style.display = "none";
    }
  },

  updateSpinnerVisibility() {
    const el = this.ensureSpinnerElements();
    if (!el) {
      return;
    }
    el.style.display = this.spinnerActiveCount > 0 ? "flex" : "none";
  },

  showSpinner() {
    this.spinnerActiveCount = Math.max(0, this.spinnerActiveCount) + 1;
    this.updateSpinnerVisibility();
  },

  hideSpinner() {
    this.spinnerActiveCount = Math.max(0, this.spinnerActiveCount - 1);
    this.updateSpinnerVisibility();
  },
};
