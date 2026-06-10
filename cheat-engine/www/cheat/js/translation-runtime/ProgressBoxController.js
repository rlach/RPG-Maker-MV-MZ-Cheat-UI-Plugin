export function computeStackedProgressBoxPosition({
    anchorRect,
    boxWidth,
    boxHeight,
    viewportWidth,
    viewportHeight,
    gap = 8,
}) {
    const safeAnchor = anchorRect || { left: 0, top: 0, bottom: 0, width: 0 };
    const safeBoxWidth = Math.max(0, Number(boxWidth) || 0);
    const safeBoxHeight = Math.max(0, Number(boxHeight) || 0);
    const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    const safeGap = Math.max(0, Number(gap) || 0);

    const maxLeft = Math.max(0, safeViewportWidth - safeBoxWidth);
    const maxTop = Math.max(0, safeViewportHeight - safeBoxHeight);
    const left = Math.max(0, Math.min(maxLeft, Number(safeAnchor.left) || 0));
    const preferAbove = (Number(safeAnchor.top) || 0) >= safeViewportHeight * 0.5;
    const rawTop = preferAbove
        ? (Number(safeAnchor.top) || 0) - safeBoxHeight - safeGap
        : (Number(safeAnchor.bottom) || 0) + safeGap;

    return {
        left,
        top: Math.max(0, Math.min(maxTop, rawTop)),
    };
}

function buildMarkup(idPrefix) {
    return `<div class="tof-progress-content"><div class="tof-progress-line map-progress" id="${idPrefix}-map-progress"></div><div class="tof-progress-line message-progress" id="${idPrefix}-message-progress"></div><div class="tof-progress-line total-completion-progress" id="${idPrefix}-total-completion-progress"></div><div class="tof-progress-line current-errors-progress" id="${idPrefix}-current-errors-progress"></div><div class="tof-progress-line total-errors-progress" id="${idPrefix}-total-errors-progress"></div><div class="tof-progress-line flat-progress" id="${idPrefix}-flat-progress"></div></div><button type="button" class="tof-progress-close-btn" id="${idPrefix}-close-btn"></button>`;
}

function clampPosition(left, top, boxWidth, boxHeight, viewportWidth, viewportHeight) {
    const safeBoxWidth = Math.max(0, Number(boxWidth) || 0);
    const safeBoxHeight = Math.max(0, Number(boxHeight) || 0);
    const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
    const maxLeft = Math.max(0, safeViewportWidth - safeBoxWidth);
    const maxTop = Math.max(0, safeViewportHeight - safeBoxHeight);

    return {
        left: Math.max(0, Math.min(maxLeft, Number(left) || 0)),
        top: Math.max(0, Math.min(maxTop, Number(top) || 0)),
    };
}

export class ProgressBoxController {
    constructor(runtime, options = {}) {
        this.runtime = runtime;
        this.channel = options.channel || 'main';
        this.boxId = options.boxId || `tof-progress-box-${this.channel}`;
        this.secondary = !!options.secondary;
        this.closeTitle = options.closeTitle || 'Abort queue';
        this.closeLabel = options.closeLabel || 'x';
        this.onClose = options.onClose || (() => {});
        this.getAnchorController = options.getAnchorController || (() => null);
        this.onLayoutChanged = options.onLayoutChanged || (() => {});
        this.draggable = options.draggable !== false;
        this.dragState = null;
        this.dragHandlers = null;
        this.closeBtnBound = false;
        this.position = null;
        this.positionAnchor = null;
        this.lines = {
            mapProgress: '',
            messageProgress: '',
            totalCompletionProgress: '',
            currentErrorsProgress: '',
            totalErrorsProgress: '',
        };
        this.el = null;
    }

    static ensureSharedStyle(hostDoc) {
        if (!hostDoc) {
            return null;
        }

        const existingStyle = hostDoc.getElementById('tof-progress-box-style');
        if (existingStyle) {
            return existingStyle;
        }

        const style = hostDoc.createElement('style');
        style.id = 'tof-progress-box-style';
        style.textContent = [
            '.tof-progress-box { position: fixed; right: 12px; bottom: 72px; padding: 8px 24px 8px 12px; display: none; background: rgba(50, 50, 50, 0.75); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); pointer-events: auto; z-index: 9998; font-family: Arial, sans-serif; text-align: right; cursor: move; user-select: none; }',
            '.tof-progress-box.tof-progress-secondary { z-index: 9997; }',
            '.tof-progress-box.tof-progress-flat { padding: 6px 8px; border-radius: 0; text-align: left; display: none; align-items: center; gap: 8px; background: rgba(28, 28, 28, 0.88); }',
            '.tof-progress-box .tof-progress-content { display: block; }',
            '.tof-progress-box.tof-progress-flat .tof-progress-content { display: flex; align-items: center; min-width: 0; }',
            '.tof-progress-box.tof-dragging { box-shadow: 0 6px 18px rgba(0,0,0,0.4); }',
            '.tof-progress-box .tof-progress-close-btn { position: absolute; right: 6px; top: 4px; width: 14px; height: 14px; line-height: 12px; border: 0; border-radius: 3px; background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.82); font-size: 11px; padding: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }',
            '.tof-progress-box .tof-progress-close-btn:hover { background: rgba(255,255,255,0.2); color: rgba(255,255,255,1); }',
            '.tof-progress-box.tof-progress-flat .tof-progress-close-btn { position: static; width: auto; height: auto; line-height: 1; padding: 0; border-radius: 0; background: transparent; color: #fff; font-size: 12px; margin-left: auto; flex-shrink: 0; }',
            '.tof-progress-box.tof-progress-flat .tof-progress-close-btn:hover { background: transparent; color: #fff; text-decoration: underline; }',
            '.tof-progress-box .tof-progress-line { color: #fff; font-size: 12px; line-height: 1.5; margin: 1px 0; white-space: nowrap; }',
            '.tof-progress-box .tof-progress-line.map-progress { font-weight: bold; color: #82d4f8; }',
            '.tof-progress-box .tof-progress-line.message-progress { color: #ccc; }',
            '.tof-progress-box .tof-progress-line.total-completion-progress { color: #b0f3bf; }',
            '.tof-progress-box .tof-progress-line.current-errors-progress { color: #ffd9a3; }',
            '.tof-progress-box .tof-progress-line.total-errors-progress { color: #ffb3b3; }',
            '.tof-progress-box .tof-progress-line.flat-progress { display: none; color: #fff; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: min(88vw, 1200px); }',
            '.tof-progress-box.tof-progress-flat .tof-progress-line.flat-progress { display: block; }',
            '.tof-progress-box .tof-progress-line.flat-progress .map-progress { font-weight: bold; color: #82d4f8; }',
            '.tof-progress-box .tof-progress-line.flat-progress .message-progress { color: #ccc; }',
            '.tof-progress-box .tof-progress-line.flat-progress .total-completion-progress { color: #b0f3bf; }',
            '.tof-progress-box .tof-progress-line.flat-progress .current-errors-progress { color: #ffd9a3; }',
            '.tof-progress-box .tof-progress-line.flat-progress .total-errors-progress { color: #ffb3b3; }',
            '.tof-progress-box .tof-progress-line.flat-progress .flat-progress-separator { color: rgba(255,255,255,0.7); }',
            '.tof-progress-box.tof-progress-flat .tof-progress-line.map-progress, .tof-progress-box.tof-progress-flat .tof-progress-line.message-progress, .tof-progress-box.tof-progress-flat .tof-progress-line.total-completion-progress, .tof-progress-box.tof-progress-flat .tof-progress-line.current-errors-progress, .tof-progress-box.tof-progress-flat .tof-progress-line.total-errors-progress { display: none !important; }',
        ].join('');
        hostDoc.head.appendChild(style);
        return style;
    }

    isFlatMode() {
        return this.runtime.isFlatProgressWindowEnabled();
    }

    getHostDocument() {
        return this.runtime.getSpinnerHostDocument();
    }

    getHostWindow(hostDoc = this.getHostDocument()) {
        return hostDoc?.defaultView || globalThis;
    }

    getElement() {
        return this.el;
    }

    getLineId(suffix) {
        return `${this.boxId}-${suffix}`;
    }

    getLineElement(el, suffix) {
        return el.querySelector(`#${this.getLineId(suffix)}`);
    }

    ensureElements() {
        const hostDoc = this.getHostDocument();
        if (!hostDoc) {
            return null;
        }

        ProgressBoxController.ensureSharedStyle(hostDoc);

        if (!this.el) {
            const existingEl = hostDoc.getElementById(this.boxId);
            const el = existingEl || hostDoc.createElement('div');
            el.id = this.boxId;
            el.className = `tof-progress-box${this.secondary ? ' tof-progress-secondary' : ''}`;
            el.innerHTML = buildMarkup(this.boxId);
            if (!existingEl) {
                hostDoc.body.appendChild(el);
            }
            this.el = el;
        }

        if (!this.closeBtnBound && this.el) {
            const closeBtn = this.getLineElement(this.el, 'close-btn');
            if (closeBtn) {
                const stopDragPropagation = (event) => {
                    event?.stopPropagation();
                };
                const onCloseClick = (event) => {
                    event?.preventDefault();
                    event?.stopPropagation();
                    this.onClose();
                };

                closeBtn.textContent = this.closeLabel;
                closeBtn.title = this.closeTitle;
                closeBtn.addEventListener('mousedown', stopDragPropagation);
                closeBtn.addEventListener('mouseup', stopDragPropagation);
                closeBtn.addEventListener('click', onCloseClick);
                this.closeBtnBound = true;
            }
        }

        if (this.draggable && !this.secondary) {
            this.ensureDraggable(this.el, hostDoc);
        }

        this.applyMode(this.el);
        this.ensureDefaultPosition(this.el, hostDoc);
        this.applyPosition(this.el, hostDoc);

        return this.el;
    }

    applyMode(el = this.el) {
        if (!el) {
            return;
        }
        el.classList.toggle('tof-progress-flat', this.isFlatMode());
    }

    getLegacyDefaultPosition(el, hostDoc) {
        const hostWindow = this.getHostWindow(hostDoc);
        const viewportWidth = Math.max(0, hostWindow.innerWidth || 0);
        const viewportHeight = Math.max(0, hostWindow.innerHeight || 0);
        const boxWidth = Math.max(0, el?.offsetWidth || 0);
        const boxHeight = Math.max(0, el?.offsetHeight || 0);

        if (this.isFlatMode()) {
            return {
                left: 0,
                top: Math.max(0, viewportHeight - boxHeight),
            };
        }

        return {
            left: Math.max(0, viewportWidth - boxWidth),
            top: Math.max(0, Math.round(viewportHeight * 0.5)),
        };
    }

    getDefaultPosition(el, hostDoc) {
        if (!this.secondary) {
            return this.getLegacyDefaultPosition(el, hostDoc);
        }

        const anchorController = this.getAnchorController();
        const anchorEl = anchorController?.getElement?.();
        if (!anchorEl) {
            return this.getLegacyDefaultPosition(el, hostDoc);
        }

        const hostWindow = this.getHostWindow(hostDoc);
        const anchorRect = anchorEl.getBoundingClientRect();
        return computeStackedProgressBoxPosition({
            anchorRect,
            boxWidth: Math.max(0, el?.offsetWidth || anchorRect.width || 0),
            boxHeight: Math.max(0, el?.offsetHeight || 0),
            viewportWidth: Math.max(0, hostWindow.innerWidth || 0),
            viewportHeight: Math.max(0, hostWindow.innerHeight || 0),
        });
    }

    ensureDefaultPosition(el = this.el, hostDoc = this.getHostDocument()) {
        if (this.secondary) {
            this.position = this.getDefaultPosition(el, hostDoc);
            this.positionAnchor = 'stacked';
            return;
        }

        if (this.position) {
            return;
        }
        this.position = this.getDefaultPosition(el, hostDoc);
        this.positionAnchor = this.isFlatMode() ? 'bottom-left' : null;
    }

    resetPositionToDefault() {
        const el = this.ensureElements();
        const hostDoc = this.getHostDocument();
        if (!el || !hostDoc) {
            return;
        }

        this.applyMode(el);
        this.position = this.getDefaultPosition(el, hostDoc);
        let nextAnchor = null;
        if (this.secondary) {
            nextAnchor = 'stacked';
        } else if (this.isFlatMode()) {
            nextAnchor = 'bottom-left';
        }
        this.positionAnchor = nextAnchor;
        this.applyPosition(el, hostDoc);
        this.refreshContent();
        this.onLayoutChanged();
    }

    refreshAnchoredPosition() {
        if (!this.secondary) {
            return;
        }

        const el = this.ensureElements();
        const hostDoc = this.getHostDocument();
        if (!el || !hostDoc) {
            return;
        }

        this.position = this.getDefaultPosition(el, hostDoc);
        this.positionAnchor = 'stacked';
        this.applyPosition(el, hostDoc);
    }

    escapeText(text) {
        return String(text || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    renderFlatSections(flatProgressEl, sections) {
        if (!flatProgressEl) {
            return;
        }

        const safeSections = Array.isArray(sections) ? sections.filter((entry) => entry?.text) : [];
        if (safeSections.length <= 0) {
            flatProgressEl.innerHTML = '';
            return;
        }

        flatProgressEl.innerHTML = safeSections
            .map((entry, index) => {
                const separator =
                    index < safeSections.length - 1
                        ? '<span class="flat-progress-separator"> | </span>'
                        : '';
                return `<span class="${entry.className}">${this.escapeText(entry.text)}</span>${separator}`;
            })
            .join('');
    }

    refreshContent() {
        const mapProgress = this.lines.mapProgress;
        const messageProgress = this.lines.messageProgress;
        const totalCompletionProgress = this.lines.totalCompletionProgress;
        const currentErrorsProgress = this.lines.currentErrorsProgress;
        const totalErrorsProgress = this.lines.totalErrorsProgress;

        this.update(
            mapProgress,
            messageProgress,
            totalCompletionProgress,
            currentErrorsProgress,
            totalErrorsProgress
        );
    }

    ensureDraggable(el, hostDoc) {
        if (!el || !hostDoc || this.dragHandlers) {
            return;
        }

        const onMouseDown = (event) => {
            if (event.button !== 0) {
                return;
            }

            const rect = el.getBoundingClientRect();
            this.dragState = {
                startMouseX: event.clientX,
                startMouseY: event.clientY,
                startLeft: rect.left,
                startTop: rect.top,
            };

            el.classList.add('tof-dragging');
            event.preventDefault();
        };

        const onMouseMove = (event) => {
            if (!this.dragState) {
                return;
            }

            const deltaX = event.clientX - this.dragState.startMouseX;
            const deltaY = event.clientY - this.dragState.startMouseY;
            this.setPosition(
                this.dragState.startLeft + deltaX,
                this.dragState.startTop + deltaY,
                el,
                hostDoc
            );
            event.preventDefault();
        };

        const onMouseUp = () => {
            if (!this.dragState) {
                return;
            }
            this.dragState = null;
            el.classList.remove('tof-dragging');
        };

        el.addEventListener('mousedown', onMouseDown);
        hostDoc.addEventListener('mousemove', onMouseMove);
        hostDoc.addEventListener('mouseup', onMouseUp);

        this.dragHandlers = {
            onMouseDown,
            onMouseMove,
            onMouseUp,
        };
    }

    clampPosition(left, top, el, hostDoc) {
        const hostWindow = this.getHostWindow(hostDoc);
        return clampPosition(
            left,
            top,
            Math.max(0, el?.offsetWidth || 0),
            Math.max(0, el?.offsetHeight || 0),
            Math.max(0, hostWindow.innerWidth || 0),
            Math.max(0, hostWindow.innerHeight || 0)
        );
    }

    setPosition(left, top, el = this.el, hostDoc = this.getHostDocument()) {
        if (!el || !hostDoc || this.secondary) {
            return;
        }

        this.position = this.clampPosition(left, top, el, hostDoc);
        this.positionAnchor = null;
        this.applyPosition(el, hostDoc);
        this.onLayoutChanged();
    }

    applyPosition(el = this.el, hostDoc = this.getHostDocument()) {
        if (!el || !hostDoc) {
            return;
        }

        if (!this.position || this.secondary) {
            this.position = this.getDefaultPosition(el, hostDoc);
        }

        const clamped = this.secondary
            ? this.getDefaultPosition(el, hostDoc)
            : this.clampPosition(this.position.left, this.position.top, el, hostDoc);

        if (this.positionAnchor === 'bottom-left' && this.isFlatMode()) {
            const hostWindow = this.getHostWindow(hostDoc);
            const viewportHeight = Math.max(0, hostWindow.innerHeight || 0);
            const boxHeight = Math.max(0, el.offsetHeight || 0);
            clamped.left = 0;
            clamped.top = Math.max(0, viewportHeight - boxHeight);
        }

        this.position = clamped;
        el.style.left = `${clamped.left}px`;
        el.style.top = `${clamped.top}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    }

    updateLine(el, suffix, text) {
        const lineEl = this.getLineElement(el, suffix);
        if (!lineEl) {
            return;
        }

        if (text !== null && text !== undefined) {
            lineEl.textContent = text;
            lineEl.style.display = text ? 'block' : 'none';
            return;
        }

        lineEl.textContent = '';
        lineEl.style.display = 'none';
    }

    update(
        mapProgress = null,
        messageProgress = null,
        totalCompletionProgress = null,
        currentErrorsProgress = null,
        totalErrorsProgress = null
    ) {
        const safeMapProgress = typeof mapProgress === 'string' ? mapProgress : '';
        const safeMessageProgress = typeof messageProgress === 'string' ? messageProgress : '';
        const safeTotalCompletionProgress =
            typeof totalCompletionProgress === 'string' ? totalCompletionProgress : '';
        const safeCurrentErrorsProgress =
            typeof currentErrorsProgress === 'string' ? currentErrorsProgress : '';
        const safeTotalErrorsProgress =
            typeof totalErrorsProgress === 'string' ? totalErrorsProgress : '';

        this.lines = {
            mapProgress: safeMapProgress,
            messageProgress: safeMessageProgress,
            totalCompletionProgress: safeTotalCompletionProgress,
            currentErrorsProgress: safeCurrentErrorsProgress,
            totalErrorsProgress: safeTotalErrorsProgress,
        };

        const el = this.ensureElements();
        if (!el) {
            return;
        }

        this.applyMode(el);
        this.updateLine(el, 'map-progress', safeMapProgress);
        this.updateLine(el, 'message-progress', safeMessageProgress);
        this.updateLine(el, 'total-completion-progress', safeTotalCompletionProgress);
        this.updateLine(el, 'current-errors-progress', safeCurrentErrorsProgress);
        this.updateLine(el, 'total-errors-progress', safeTotalErrorsProgress);

        const flatProgressEl = this.getLineElement(el, 'flat-progress');
        if (flatProgressEl) {
            if (this.isFlatMode()) {
                const sections = [
                    { className: 'map-progress', text: safeMapProgress },
                    { className: 'message-progress', text: safeMessageProgress },
                    { className: 'total-completion-progress', text: safeTotalCompletionProgress },
                    { className: 'current-errors-progress', text: safeCurrentErrorsProgress },
                    { className: 'total-errors-progress', text: safeTotalErrorsProgress },
                ].filter((entry) => entry.text.trim() !== '');
                this.renderFlatSections(flatProgressEl, sections);
            } else {
                flatProgressEl.innerHTML = '';
            }
        }

        const hasContent =
            safeMapProgress.length > 0 ||
            safeMessageProgress.length > 0 ||
            safeTotalCompletionProgress.length > 0 ||
            safeCurrentErrorsProgress.length > 0 ||
            safeTotalErrorsProgress.length > 0;

        let display = 'none';
        if (hasContent) {
            display = this.isFlatMode() ? 'flex' : 'block';
        }
        el.style.display = display;
        this.applyPosition(el, this.getHostDocument());
        this.onLayoutChanged();
    }

    hide() {
        const el = this.ensureElements();
        if (el) {
            el.style.display = 'none';
        }
    }
}
