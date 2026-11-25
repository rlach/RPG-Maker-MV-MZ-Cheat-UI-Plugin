/** Persist native CSS resizing without writing layout from ResizeObserver.
 * Read the border box in the next frame: contentRect excludes card borders,
 * and feeding it back into width/height can repeatedly shrink or clamp a card.
 */
export function observeOverlaySize(element, saveSize, host = window) {
    if (!host.ResizeObserver) return () => {};
    let frame = null;
    let previousWidth;
    let previousHeight;
    const observer = new host.ResizeObserver(() => {
        if (frame !== null) return;
        frame = host.requestAnimationFrame(() => {
            frame = null;
            const width = element.offsetWidth;
            const height = element.offsetHeight;
            // Hidden/unmounting cards must not overwrite the user's saved size.
            if (width <= 0 || height <= 0) return;
            if (width === previousWidth && height === previousHeight) return;
            previousWidth = width;
            previousHeight = height;
            saveSize(width, height);
        });
    });
    observer.observe(element);
    return () => {
        observer.disconnect();
        if (frame !== null) host.cancelAnimationFrame(frame);
        frame = null;
    };
}
