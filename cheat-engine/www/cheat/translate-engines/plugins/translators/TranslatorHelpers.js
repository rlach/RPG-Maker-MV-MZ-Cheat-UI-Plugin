/**
 * Safely parse JSON with fallback support.
 * If value is not a string, returns value when non-nullish, otherwise fallback.
 * @param {*} value
 * @param {*} fallback
 * @returns {*}
 */
export function parseJsonSafely(value, fallback = null) {
    if (typeof value !== 'string') {
        return value ?? fallback;
    }

    const normalized = value.trim();
    if (!normalized) {
        return fallback;
    }

    try {
        return JSON.parse(normalized);
    } catch {
        return fallback;
    }
}