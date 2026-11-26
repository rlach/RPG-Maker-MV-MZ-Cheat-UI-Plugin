export function resolveOverlaySize(saved, host = window) {
    return saved
        ? { ...saved }
        : {
              width: Math.min(host.innerWidth * 0.98, host.innerWidth - 16),
              height: Math.min(host.innerHeight * 0.98, host.innerHeight - 16),
          };
}

export function observeOverlaySize(element, saveSize, host = window) {
    if (!host.MutationObserver) return () => {};
    let previousWidth = element.style.width;
    let previousHeight = element.style.height;
    const syncSize = () => {
        const { width, height } = element.style;
        if (width === previousWidth && height === previousHeight) return;
        if (!width.endsWith('px') || !height.endsWith('px')) return;
        const nextWidth = Number.parseFloat(width);
        const nextHeight = Number.parseFloat(height);
        if (!(nextWidth > 0 && nextHeight > 0)) return;
        previousWidth = width;
        previousHeight = height;
        saveSize(nextWidth, nextHeight);
    };
    const observer = new host.MutationObserver(syncSize);
    observer.observe(element, { attributes: true, attributeFilter: ['style'] });
    return () => {
        observer.disconnect();
        syncSize();
    };
}
