export function getVariableType(value) {
    if (value === null) return 'null';
    return Array.isArray(value) ? 'array' : typeof value;
}
