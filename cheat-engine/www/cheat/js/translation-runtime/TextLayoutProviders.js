import {
    ensureRootWindowStateValue,
    getRootWindow,
    notifyRootWindowEvent,
} from '../RootWindowState.js';

const KEY = '__CHEAT_TEXT_LAYOUT_PROVIDERS__';
export const TEXT_LAYOUT_CHANGED_EVENT = 'cheat:text-layout-changed';

/** Providers return optional width (right boundary), inset, font and maxRows.
 * They measure presentation only; never change game windows or message state.
 */
export function registerTextLayoutProvider(pluginName, provider) {
    if (typeof pluginName !== 'string' || !pluginName || typeof provider !== 'function')
        throw new TypeError('A text-layout provider requires a plugin name and callback');
    const providers = ensureRootWindowStateValue(KEY, () => new Map());
    providers.set(pluginName, provider);
    notifyRootWindowEvent(TEXT_LAYOUT_CHANGED_EVENT);
    return () => {
        if (providers.get(pluginName) !== provider) return;
        providers.delete(pluginName);
        notifyRootWindowEvent(TEXT_LAYOUT_CHANGED_EVENT);
    };
}

export function applyTextLayoutProviders(geometry, context, root = getRootWindow()) {
    let result = geometry;
    for (const [name, provider] of root[KEY] || []) {
        try {
            const patch = provider({ ...context, geometry: result });
            if (!patch) continue;
            const next = { ...result, ...patch };
            if (
                !Number.isFinite(next.width) ||
                next.width <= 0 ||
                !Number.isFinite(next.inset) ||
                next.inset < 0 ||
                !Number.isFinite(next.font?.baseFontSize) ||
                next.font.baseFontSize <= 0 ||
                typeof next.font.measureGlyph !== 'function' ||
                typeof next.font.resizeFont !== 'function' ||
                (next.maxRows !== undefined && (!Number.isFinite(next.maxRows) || next.maxRows < 1))
            )
                throw new TypeError('Invalid text-layout geometry');
            result = next;
        } catch (error) {
            console.warn(`[TextLayoutGeometry] Ignoring invalid provider ${name}`, error);
        }
    }
    return result;
}

/** Capacity uses the advance of digit '0' and the native font size steps. */
export function getTextLayoutCapacities(layout) {
    if (!layout) return { minus1: null, base: null, plus1: null, plus2: null };
    const { font, width } = layout;
    const base = font.baseFontSize;
    const plus1 = font.resizeFont(base, 1);
    const sizes = {
        minus1: font.resizeFont(base, -1),
        base,
        plus1,
        plus2: font.resizeFont(plus1, 1),
    };
    return Object.fromEntries(
        Object.entries(sizes).map(([key, size]) => {
            const advance = font.measureGlyph('0', size);
            return [key, advance > 0 ? Math.floor(width / advance) : null];
        })
    );
}

/** Manual wrapping uses digit counts and the configured font-size multiplier. */
export function getManualTextLayoutCapacities(width, multiplier) {
    const base = Number(width);
    const scale = Number(multiplier);
    if (!(base > 0 && scale > 0)) return getTextLayoutCapacities(null);
    return {
        minus1: Math.floor(base / scale),
        base: Math.floor(base),
        plus1: Math.floor(base * scale),
        plus2: Math.floor(base * scale * scale),
    };
}
