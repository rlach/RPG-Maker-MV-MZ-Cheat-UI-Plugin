import { ProgressBoxController } from './ProgressBoxController.js';

export const translateOnTheFlyUiMethods = {
    getSpinnerHostDocument() {
        // Always prefer the main game window as the host for spinner UI
        const parentDoc =
            globalThis.__CHEAT_EXTERNAL_WINDOW__ && globalThis.opener && !globalThis.opener.closed
                ? globalThis.opener.document
                : null;
        return parentDoc || (typeof document === 'undefined' ? null : document);
    },

    ensureSpinnerElements() {
        const hostDoc = this.getSpinnerHostDocument();
        if (!hostDoc) {
            return null;
        }

        if (!this._spinnerStyle) {
            const existingStyle = hostDoc.getElementById('tof-translate-spinner-style');
            const style = existingStyle || hostDoc.createElement('style');
            style.id = 'tof-translate-spinner-style';
            style.textContent = [
                '#tof-translate-spinner { position: fixed; right: 12px; bottom: 12px; width: 48px; height: 48px; display: none; align-items: center; justify-content: center; pointer-events: none; z-index: 9999; }',
                '#tof-translate-spinner .tof-spinner-ring { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.35); border-top: 3px solid #4fc3f7; border-radius: 50%; animation: tof-translate-spin 0.9s linear infinite; box-shadow: 0 0 10px rgba(0,0,0,0.35); background: rgba(0,0,0,0.25); }',
                '@keyframes tof-translate-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }',
            ].join('');
            if (!existingStyle) {
                hostDoc.head.appendChild(style);
            }
            this._spinnerStyle = style;
        }

        if (!this._spinnerEl) {
            const existingEl = hostDoc.getElementById('tof-translate-spinner');
            const el = existingEl || hostDoc.createElement('div');
            el.id = 'tof-translate-spinner';
            el.innerHTML = '<div class="tof-spinner-ring"></div>';
            if (!existingEl) {
                hostDoc.body.appendChild(el);
            }
            this._spinnerEl = el;
        }

        return this._spinnerEl;
    },

    getProgressBoxController(channel = 'main') {
        if (!this._progressBoxControllers) {
            this._progressBoxControllers = {};
        }

        if (!this._progressBoxControllers[channel]) {
            const isForeground = channel === 'foreground';
            this._progressBoxControllers[channel] = new ProgressBoxController(this, {
                channel,
                boxId: isForeground ? 'tof-progress-box-foreground' : 'tof-progress-box-main',
                secondary: isForeground,
                closeTitle: isForeground ? 'Abort OTF' : 'Abort queue',
                onClose: () => {
                    if (isForeground) {
                        this.requestRealtimeAbort();
                        return;
                    }
                    this.requestBatchQueueAbort();
                },
                getAnchorController: () => this.getProgressBoxController('main'),
                onLayoutChanged: () => {
                    if (channel === 'main' && this._progressBoxControllers?.foreground) {
                        this._progressBoxControllers.foreground.refreshAnchoredPosition();
                    }
                },
                draggable: !isForeground,
            });
        }

        return this._progressBoxControllers[channel];
    },

    getProgressUiAdapter(channel = 'main') {
        return {
            showSpinner: this.showSpinner.bind(this),
            hideSpinner: this.hideSpinner.bind(this),
            updateProgressBox: (
                mapProgress,
                messageProgress,
                totalCompletionProgress,
                currentErrorsProgress,
                totalErrorsProgress
            ) => {
                this.updateProgressBox(
                    mapProgress,
                    messageProgress,
                    totalCompletionProgress,
                    currentErrorsProgress,
                    totalErrorsProgress,
                    channel
                );
            },
            hideProgressBox: () => {
                this.hideProgressBox(channel);
            },
        };
    },

    ensureProgressBoxElements(channel = 'main') {
        return this.getProgressBoxController(channel).ensureElements();
    },

    isFlatProgressWindowEnabled() {
        return !!this.flatProgressWindow;
    },

    applyProgressBoxMode(el) {
        if (!el) {
            return;
        }
        el.classList.toggle('tof-progress-flat', this.isFlatProgressWindowEnabled());
    },

    getDefaultProgressBoxPosition(el, hostDoc) {
        const safeEl = el || this._progressBoxEl;
        const safeDoc = hostDoc || this.getSpinnerHostDocument();
        if (!safeEl || !safeDoc) {
            return { left: 0, top: 0 };
        }

        const hostWindow = safeDoc.defaultView || globalThis;
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
        this._progressBoxPositionAnchor = this.isFlatProgressWindowEnabled() ? 'bottom-left' : null;
    },

    resetProgressBoxPositionToDefault() {
        this.getProgressBoxController('main').resetPositionToDefault();
        this.getProgressBoxController('foreground').resetPositionToDefault();
    },

    escapeProgressText(text) {
        return String(text || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    },

    renderFlatProgressSections(flatProgressEl, sections) {
        if (!flatProgressEl) {
            return;
        }

        const safeSections = Array.isArray(sections) ? sections.filter((entry) => entry?.text) : [];
        if (safeSections.length <= 0) {
            flatProgressEl.innerHTML = '';
            return;
        }

        const html = safeSections
            .map((entry, index) => {
                const separator =
                    index < safeSections.length - 1
                        ? '<span class="flat-progress-separator"> | </span>'
                        : '';
                return `<span class="${entry.className}">${this.escapeProgressText(entry.text)}</span>${separator}`;
            })
            .join('');

        flatProgressEl.innerHTML = html;
    },

    refreshProgressBoxContentFromCurrentElements(el) {
        const safeEl = el || this._progressBoxEl;
        if (!safeEl) {
            return;
        }

        const mapProgressEl = safeEl.querySelector('#tof-map-progress');
        const messageProgressEl = safeEl.querySelector('#tof-message-progress');
        const totalCompletionEl = safeEl.querySelector('#tof-total-completion-progress');
        const currentErrorsEl = safeEl.querySelector('#tof-current-errors-progress');
        const totalErrorsEl = safeEl.querySelector('#tof-total-errors-progress');
        const flatProgressEl = safeEl.querySelector('#tof-flat-progress');
        const isFlat = this.isFlatProgressWindowEnabled();

        const sections = [
            {
                className: 'map-progress',
                text: mapProgressEl ? String(mapProgressEl.textContent || '').trim() : '',
            },
            {
                className: 'message-progress',
                text: messageProgressEl ? String(messageProgressEl.textContent || '').trim() : '',
            },
            {
                className: 'total-completion-progress',
                text: totalCompletionEl ? String(totalCompletionEl.textContent || '').trim() : '',
            },
            {
                className: 'current-errors-progress',
                text: currentErrorsEl ? String(currentErrorsEl.textContent || '').trim() : '',
            },
            {
                className: 'total-errors-progress',
                text: totalErrorsEl ? String(totalErrorsEl.textContent || '').trim() : '',
            },
        ].filter((entry) => entry.text);

        if (isFlat) {
            this.renderFlatProgressSections(flatProgressEl, sections);
        }

        if (sections.length > 0) {
            safeEl.style.display = isFlat ? 'flex' : 'block';
        } else {
            safeEl.style.display = 'none';
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

            el.classList.add('tof-dragging');
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
                hostDoc
            );
            event.preventDefault();
        };

        const onMouseUp = () => {
            if (!this._progressBoxDragState) {
                return;
            }
            this._progressBoxDragState = null;
            el.classList.remove('tof-dragging');
        };

        el.addEventListener('mousedown', onMouseDown);
        hostDoc.addEventListener('mousemove', onMouseMove);
        hostDoc.addEventListener('mouseup', onMouseUp);

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
        const hostWindow = hostDoc.defaultView || globalThis;
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
            hostDoc
        );

        if (
            this._progressBoxPositionAnchor === 'bottom-left' &&
            this.isFlatProgressWindowEnabled()
        ) {
            const hostWindow = hostDoc.defaultView || globalThis;
            const viewportHeight = Math.max(0, hostWindow.innerHeight || 0);
            const boxHeight = Math.max(0, el.offsetHeight || 0);
            clamped.left = 0;
            clamped.top = Math.max(0, viewportHeight - boxHeight);
        }

        this._progressBoxPosition = clamped;

        el.style.left = `${clamped.left}px`;
        el.style.top = `${clamped.top}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    },

    updateProgressBox(
        mapProgress = null,
        messageProgress = null,
        totalCompletionProgress = null,
        currentErrorsProgress = null,
        totalErrorsProgress = null,
        channel = 'main'
    ) {
        this.getProgressBoxController(channel).update(
            mapProgress,
            messageProgress,
            totalCompletionProgress,
            currentErrorsProgress,
            totalErrorsProgress
        );
    },

    hideProgressBox(channel = 'main') {
        this.getProgressBoxController(channel).hide();
    },

    updateSpinnerVisibility() {
        const el = this.ensureSpinnerElements();
        if (!el) {
            return;
        }
        el.style.display = this.spinnerActiveCount > 0 ? 'flex' : 'none';
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
