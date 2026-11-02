const guardedDocuments = new WeakSet();

/** Keep native UI scrolling away from RPG Maker's already-bound wheel handler. */
export function installUiScrollGuard(hostWindow) {
    const document = hostWindow.document;
    if (!document?.body || guardedDocuments.has(document)) return;
    guardedDocuments.add(document);
    document.body.addEventListener(
        'wheel',
        (event) => {
            const target = event.target?.closest ? event.target : event.target?.parentElement;
            if (!target?.closest('#app, .v-overlay-container')) return;
            // Bubble after component handlers. Never cancel the browser default:
            // both native scrolling and nested scroll containers depend on it.
            // Patching TouchInput._onWheel cannot replace a listener bound earlier.
            event.stopPropagation();
        },
        { passive: true }
    );
}
