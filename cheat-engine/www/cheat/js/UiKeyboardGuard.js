const guardedDocuments = new WeakSet();

/** Keep RPG Maker's document listeners from cancelling native editing keys. */
export function installUiKeyboardGuard(hostWindow) {
    const document = hostWindow.document;
    if (guardedDocuments.has(document)) return;
    guardedDocuments.add(document);
    const guard = (event) => {
        const target = event.target;
        if (!target?.closest || !target.closest('#app, .v-overlay-container')) return;
        if (
            target.closest('input, textarea, select, [role="textbox"], [role="combobox"]') ||
            target.isContentEditable
        ) {
            // Bubble after the field/framework handlers, preserving the browser default action.
            event.stopPropagation();
        }
    };
    for (const type of ['keydown', 'keyup', 'keypress']) {
        document.body.addEventListener(type, guard);
    }
}
