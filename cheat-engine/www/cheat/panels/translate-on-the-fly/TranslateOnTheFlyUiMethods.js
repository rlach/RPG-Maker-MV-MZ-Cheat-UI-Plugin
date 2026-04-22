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
        "#tof-progress-box { position: fixed; right: 12px; bottom: 72px; padding: 8px 24px 8px 12px; display: none; background: rgba(50, 50, 50, 0.75); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); pointer-events: auto; z-index: 9998; font-family: Arial, sans-serif; text-align: right; cursor: move; user-select: none; }",
        "#tof-progress-box.tof-progress-flat { padding: 6px 8px; border-radius: 0; text-align: left; display: none; align-items: center; gap: 8px; background: rgba(28, 28, 28, 0.88); }",
        "#tof-progress-box .tof-progress-content { display: block; }",
        "#tof-progress-box.tof-progress-flat .tof-progress-content { display: flex; align-items: center; min-width: 0; }",
        "#tof-progress-box.tof-dragging { box-shadow: 0 6px 18px rgba(0,0,0,0.4); }",
        "#tof-progress-box .tof-progress-close-btn { position: absolute; right: 6px; top: 4px; width: 14px; height: 14px; line-height: 12px; border: 0; border-radius: 3px; background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.82); font-size: 11px; padding: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }",
        "#tof-progress-box .tof-progress-close-btn:hover { background: rgba(255,255,255,0.2); color: rgba(255,255,255,1); }",
        "#tof-progress-box.tof-progress-flat .tof-progress-close-btn { position: static; width: auto; height: auto; line-height: 1; padding: 0; border-radius: 0; background: transparent; color: #fff; font-size: 12px; margin-left: auto; flex-shrink: 0; }",
        "#tof-progress-box.tof-progress-flat .tof-progress-close-btn:hover { background: transparent; color: #fff; text-decoration: underline; }",
        "#tof-progress-box .tof-progress-line { color: #fff; font-size: 12px; line-height: 1.5; margin: 1px 0; white-space: nowrap; }",
        "#tof-progress-box .tof-progress-line.map-progress { font-weight: bold; color: #82d4f8; }",
        "#tof-progress-box .tof-progress-line.message-progress { color: #ccc; }",
        "#tof-progress-box .tof-progress-line.total-completion-progress { color: #b0f3bf; }",
        "#tof-progress-box .tof-progress-line.current-errors-progress { color: #ffd9a3; }",
        "#tof-progress-box .tof-progress-line.total-errors-progress { color: #ffb3b3; }",
        "#tof-progress-box .tof-progress-line.flat-progress { display: none; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: min(88vw, 1200px); }",
        "#tof-progress-box.tof-progress-flat .tof-progress-line.flat-progress { display: block; }",
        "#tof-progress-box .tof-progress-line.flat-progress .map-progress { font-weight: bold; color: #82d4f8; }",
        "#tof-progress-box .tof-progress-line.flat-progress .message-progress { color: #ccc; }",
        "#tof-progress-box .tof-progress-line.flat-progress .total-completion-progress { color: #b0f3bf; }",
        "#tof-progress-box .tof-progress-line.flat-progress .current-errors-progress { color: #ffd9a3; }",
        "#tof-progress-box .tof-progress-line.flat-progress .total-errors-progress { color: #ffb3b3; }",
        "#tof-progress-box .tof-progress-line.flat-progress .flat-progress-separator { color: rgba(255,255,255,0.7); }",
        "#tof-progress-box.tof-progress-flat .tof-progress-line.map-progress, #tof-progress-box.tof-progress-flat .tof-progress-line.message-progress, #tof-progress-box.tof-progress-flat .tof-progress-line.total-completion-progress, #tof-progress-box.tof-progress-flat .tof-progress-line.current-errors-progress, #tof-progress-box.tof-progress-flat .tof-progress-line.total-errors-progress { display: none !important; }",
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
        '<div class="tof-progress-content"><div class="tof-progress-line map-progress" id="tof-map-progress"></div><div class="tof-progress-line message-progress" id="tof-message-progress"></div><div class="tof-progress-line total-completion-progress" id="tof-total-completion-progress"></div><div class="tof-progress-line current-errors-progress" id="tof-current-errors-progress"></div><div class="tof-progress-line total-errors-progress" id="tof-total-errors-progress"></div><div class="tof-progress-line flat-progress" id="tof-flat-progress"></div></div><button type="button" class="tof-progress-close-btn" id="tof-progress-close-btn" title="Abort queue">x</button>';
      if (!existingEl) {
        hostDoc.body.appendChild(el);
      }
      this._progressBoxEl = el;
    }

    if (!this._progressCloseBtnBound && this._progressBoxEl) {
      const closeBtn = this._progressBoxEl.querySelector("#tof-progress-close-btn");
      if (closeBtn) {
        const stopDragPropagation = (event) => {
          if (event) {
            event.stopPropagation();
          }
        };
        const onCloseClick = (event) => {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          if (typeof this.requestBatchQueueAbort === "function") {
            this.requestBatchQueueAbort();
          }
        };

        closeBtn.addEventListener("mousedown", stopDragPropagation);
        closeBtn.addEventListener("mouseup", stopDragPropagation);
        closeBtn.addEventListener("click", onCloseClick);
        this._progressCloseBtnBound = true;
      }
    }

    this.ensureProgressBoxDraggable(this._progressBoxEl, hostDoc);
    this.applyProgressBoxMode(this._progressBoxEl);
    this.ensureProgressBoxDefaultPosition(this._progressBoxEl, hostDoc);
    this.applyProgressBoxPosition(this._progressBoxEl, hostDoc);

    return this._progressBoxEl;
  },

  isFlatProgressWindowEnabled() {
    return !!this.flatProgressWindow;
  },

  applyProgressBoxMode(el) {
    if (!el) {
      return;
    }
    el.classList.toggle("tof-progress-flat", this.isFlatProgressWindowEnabled());
  },

  getDefaultProgressBoxPosition(el, hostDoc) {
    const safeEl = el || this._progressBoxEl;
    const safeDoc = hostDoc || this.getSpinnerHostDocument();
    if (!safeEl || !safeDoc) {
      return { left: 0, top: 0 };
    }

    const hostWindow = safeDoc.defaultView || window;
    const viewportWidth = Math.max(0, hostWindow.innerWidth || 0);
    const viewportHeight = Math.max(0, hostWindow.innerHeight || 0);
    const boxWidth = Math.max(0, safeEl.offsetWidth || 0);
    const boxHeight = Math.max(0, safeEl.offsetHeight || 0);

    if (this.isFlatProgressWindowEnabled()) {
      return {
        left: 0,
        top: Math.max(0, viewportHeight - boxHeight),
      };
    }

    return {
      left: Math.max(0, viewportWidth - boxWidth),
      top: Math.max(0, Math.round(viewportHeight * 0.5)),
    };
  },

  ensureProgressBoxDefaultPosition(el, hostDoc) {
    if (this._progressBoxPosition) {
      return;
    }
    this._progressBoxPosition = this.getDefaultProgressBoxPosition(el, hostDoc);
    this._progressBoxPositionAnchor = this.isFlatProgressWindowEnabled()
      ? "bottom-left"
      : null;
  },

  resetProgressBoxPositionToDefault() {
    const el = this.ensureProgressBoxElements();
    const hostDoc = this.getSpinnerHostDocument();
    if (!el || !hostDoc) {
      return;
    }

    this.applyProgressBoxMode(el);
    this._progressBoxPosition = this.getDefaultProgressBoxPosition(el, hostDoc);
    this._progressBoxPositionAnchor = this.isFlatProgressWindowEnabled()
      ? "bottom-left"
      : null;
    this.applyProgressBoxPosition(el, hostDoc);
    this.refreshProgressBoxContentFromCurrentElements(el);
  },

  escapeProgressText(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  },

  renderFlatProgressSections(flatProgressEl, sections) {
    if (!flatProgressEl) {
      return;
    }

    const safeSections = Array.isArray(sections)
      ? sections.filter((entry) => entry?.text)
      : [];
    if (safeSections.length <= 0) {
      flatProgressEl.innerHTML = "";
      return;
    }

    const html = safeSections
      .map((entry, index) => {
        const separator =
          index < safeSections.length - 1
            ? '<span class="flat-progress-separator"> | </span>'
            : "";
        return `<span class="${entry.className}">${this.escapeProgressText(entry.text)}</span>${separator}`;
      })
      .join("");

    flatProgressEl.innerHTML = html;
  },

  refreshProgressBoxContentFromCurrentElements(el) {
    const safeEl = el || this._progressBoxEl;
    if (!safeEl) {
      return;
    }

    const mapProgressEl = safeEl.querySelector("#tof-map-progress");
    const messageProgressEl = safeEl.querySelector("#tof-message-progress");
    const totalCompletionEl = safeEl.querySelector("#tof-total-completion-progress");
    const currentErrorsEl = safeEl.querySelector("#tof-current-errors-progress");
    const totalErrorsEl = safeEl.querySelector("#tof-total-errors-progress");
    const flatProgressEl = safeEl.querySelector("#tof-flat-progress");
    const isFlat = this.isFlatProgressWindowEnabled();

    const sections = [
      {
        className: "map-progress",
        text: mapProgressEl ? String(mapProgressEl.textContent || "").trim() : "",
      },
      {
        className: "message-progress",
        text: messageProgressEl
          ? String(messageProgressEl.textContent || "").trim()
          : "",
      },
      {
        className: "total-completion-progress",
        text: totalCompletionEl
          ? String(totalCompletionEl.textContent || "").trim()
          : "",
      },
      {
        className: "current-errors-progress",
        text: currentErrorsEl
          ? String(currentErrorsEl.textContent || "").trim()
          : "",
      },
      {
        className: "total-errors-progress",
        text: totalErrorsEl ? String(totalErrorsEl.textContent || "").trim() : "",
      },
    ].filter((entry) => entry.text);

    if (isFlat) {
      this.renderFlatProgressSections(flatProgressEl, sections);
    }

    if (sections.length > 0) {
      safeEl.style.display = isFlat ? "flex" : "block";
    } else {
      safeEl.style.display = "none";
    }
  },

  ensureProgressBoxDraggable(el, hostDoc) {
    if (!el || !hostDoc || this._progressBoxDragHandlers) {
      return;
    }

    const onMouseDown = (event) => {
      if (event.button !== 0) {
        return;
      }

      const rect = el.getBoundingClientRect();
      this._progressBoxDragState = {
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
      };

      el.classList.add("tof-dragging");
      event.preventDefault();
    };

    const onMouseMove = (event) => {
      const dragState = this._progressBoxDragState;
      if (!dragState) {
        return;
      }

      const deltaX = event.clientX - dragState.startMouseX;
      const deltaY = event.clientY - dragState.startMouseY;
      this.setProgressBoxPosition(
        dragState.startLeft + deltaX,
        dragState.startTop + deltaY,
        el,
        hostDoc,
      );
      event.preventDefault();
    };

    const onMouseUp = () => {
      if (!this._progressBoxDragState) {
        return;
      }
      this._progressBoxDragState = null;
      el.classList.remove("tof-dragging");
    };

    el.addEventListener("mousedown", onMouseDown);
    hostDoc.addEventListener("mousemove", onMouseMove);
    hostDoc.addEventListener("mouseup", onMouseUp);

    this._progressBoxDragHandlers = {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      hostDoc,
      el,
    };
  },

  setProgressBoxPosition(left, top, el, hostDoc) {
    const safeEl = el || this._progressBoxEl;
    const safeDoc = hostDoc || this.getSpinnerHostDocument();
    if (!safeEl || !safeDoc) {
      return;
    }

    const clamped = this.clampProgressBoxPosition(left, top, safeEl, safeDoc);
    this._progressBoxPosition = clamped;
    this._progressBoxPositionAnchor = null;
    this.applyProgressBoxPosition(safeEl, safeDoc);
  },

  clampProgressBoxPosition(left, top, el, hostDoc) {
    const hostWindow = hostDoc.defaultView || window;
    const viewportWidth = Math.max(0, hostWindow.innerWidth || 0);
    const viewportHeight = Math.max(0, hostWindow.innerHeight || 0);
    const boxWidth = Math.max(0, el.offsetWidth || 0);
    const boxHeight = Math.max(0, el.offsetHeight || 0);

    const maxLeft = Math.max(0, viewportWidth - boxWidth);
    const maxTop = Math.max(0, viewportHeight - boxHeight);

    return {
      left: Math.max(0, Math.min(maxLeft, Number(left) || 0)),
      top: Math.max(0, Math.min(maxTop, Number(top) || 0)),
    };
  },

  applyProgressBoxPosition(el, hostDoc) {
    if (!el || !hostDoc || !this._progressBoxPosition) {
      return;
    }

    const clamped = this.clampProgressBoxPosition(
      this._progressBoxPosition.left,
      this._progressBoxPosition.top,
      el,
      hostDoc,
    );

    if (
      this._progressBoxPositionAnchor === "bottom-left" &&
      this.isFlatProgressWindowEnabled()
    ) {
      const hostWindow = hostDoc.defaultView || window;
      const viewportHeight = Math.max(0, hostWindow.innerHeight || 0);
      const boxHeight = Math.max(0, el.offsetHeight || 0);
      clamped.left = 0;
      clamped.top = Math.max(0, viewportHeight - boxHeight);
    }

    this._progressBoxPosition = clamped;

    el.style.left = `${clamped.left}px`;
    el.style.top = `${clamped.top}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
  },

  updateProgressBox(
    mapProgress = null,
    messageProgress = null,
    totalCompletionProgress = null,
    currentErrorsProgress = null,
    totalErrorsProgress = null,
  ) {
    const el = this.ensureProgressBoxElements();
    if (!el) {
      return;
    }

    const mapProgressEl = el.querySelector("#tof-map-progress");
    const messageProgressEl = el.querySelector("#tof-message-progress");
    const totalCompletionEl = el.querySelector("#tof-total-completion-progress");
    const currentErrorsEl = el.querySelector("#tof-current-errors-progress");
    const totalErrorsEl = el.querySelector("#tof-total-errors-progress");
    const flatProgressEl = el.querySelector("#tof-flat-progress");

    const isFlat = this.isFlatProgressWindowEnabled();
    this.applyProgressBoxMode(el);

    if (mapProgress !== null && mapProgressEl) {
      mapProgressEl.textContent = mapProgress;
      mapProgressEl.style.display = mapProgress ? "block" : "none";
    } else if (mapProgressEl) {
      mapProgressEl.textContent = "";
      mapProgressEl.style.display = "none";
    }

    if (messageProgress !== null && messageProgressEl) {
      messageProgressEl.textContent = messageProgress;
      messageProgressEl.style.display = messageProgress ? "block" : "none";
    } else if (messageProgressEl) {
      messageProgressEl.textContent = "";
      messageProgressEl.style.display = "none";
    }

    if (totalCompletionProgress !== null && totalCompletionEl) {
      totalCompletionEl.textContent = totalCompletionProgress;
      totalCompletionEl.style.display = totalCompletionProgress ? "block" : "none";
    } else if (totalCompletionEl) {
      totalCompletionEl.textContent = "";
      totalCompletionEl.style.display = "none";
    }

    if (currentErrorsProgress !== null && currentErrorsEl) {
      currentErrorsEl.textContent = currentErrorsProgress;
      currentErrorsEl.style.display = currentErrorsProgress ? "block" : "none";
    } else if (currentErrorsEl) {
      currentErrorsEl.textContent = "";
      currentErrorsEl.style.display = "none";
    }

    if (totalErrorsProgress !== null && totalErrorsEl) {
      totalErrorsEl.textContent = totalErrorsProgress;
      totalErrorsEl.style.display = totalErrorsProgress ? "block" : "none";
    } else if (totalErrorsEl) {
      totalErrorsEl.textContent = "";
      totalErrorsEl.style.display = "none";
    }

    if (flatProgressEl) {
      if (isFlat) {
        const sections = [
          { className: "map-progress", text: mapProgress },
          { className: "message-progress", text: messageProgress },
          { className: "total-completion-progress", text: totalCompletionProgress },
          { className: "current-errors-progress", text: currentErrorsProgress },
          { className: "total-errors-progress", text: totalErrorsProgress },
        ].filter(
          (entry) => typeof entry.text === "string" && entry.text.trim() !== "",
        );
        this.renderFlatProgressSections(flatProgressEl, sections);
      } else {
        flatProgressEl.innerHTML = "";
      }
    }

    // Show box if any progress is set
    const hasContent =
      (mapProgress && mapProgress.length > 0) ||
      (messageProgress && messageProgress.length > 0) ||
      (totalCompletionProgress && totalCompletionProgress.length > 0) ||
      (currentErrorsProgress && currentErrorsProgress.length > 0) ||
      (totalErrorsProgress && totalErrorsProgress.length > 0);
    if (hasContent) {
      el.style.display = isFlat ? "flex" : "block";
    } else {
      el.style.display = "none";
    }
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
