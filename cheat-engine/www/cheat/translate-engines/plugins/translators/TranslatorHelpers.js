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

export function normalizeText(value) {
    return String(value || '').trim();
}

/**
 * Parse a plugin struct-array style value into an array of plain objects.
 * Supports already-parsed arrays and stringified JSON arrays.
 * @param {*} value
 * @returns {object[]}
 */
export function parseStructArraySafely(value) {
    const parsed = parseJsonSafely(value, []);
    if (!Array.isArray(parsed)) {
        return [];
    }

    const result = [];
    for (const item of parsed) {
        const normalized = parseJsonSafely(item, item);
        if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
            result.push(normalized);
        }
    }

    return result;
}

/**
 * Walk nested JSON-like plugin parameter values.
 * If a string value is valid JSON, the parsed value is visited recursively.
 * @param {*} value
 * @param {(current: any, context: { path: string[] }) => void} visitor
 * @param {string[]} path
 */
export function walkNestedJsonLike(value, visitor, path = []) {
    visitor(value, { path });

    if (typeof value === 'string') {
        const parsed = parseJsonSafely(value, value);
        if (parsed !== value) {
            walkNestedJsonLike(parsed, visitor, path);
        }
        return;
    }

    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
            walkNestedJsonLike(value[index], visitor, path.concat(String(index)));
        }
        return;
    }

    if (value && typeof value === 'object') {
        for (const [key, fieldValue] of Object.entries(value)) {
            walkNestedJsonLike(fieldValue, visitor, path.concat(key));
        }
    }
}
