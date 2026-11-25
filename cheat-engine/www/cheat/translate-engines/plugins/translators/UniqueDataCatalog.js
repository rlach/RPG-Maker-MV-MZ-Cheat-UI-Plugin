/** Canonical display fields from UniqueDataLoader JSON, never logic or asset fields. */
export const normalizeUniqueText = (text) => text.replace(/\r\n/g, '\n').replace(/\\r\\n/g, '\n');
export function collectUniqueDataRows(value, output = new Map()) {
    if (!value || typeof value !== 'object') return output;
    const fields = {
        text: value.faceName ? 'message_portrait' : 'message',
        textName: 'speaker',
        choicesText: 'choice',
        helpText: 'message',
    };
    for (const [field, child] of Object.entries(value)) {
        if (fields[field] && typeof child === 'string' && child.trim()) {
            const text = normalizeUniqueText(child).replace(/\n+$/, '');
            const type = fields[field];
            output.set(JSON.stringify([type, text]), { type, value: text });
        } else if (child && typeof child === 'object') collectUniqueDataRows(child, output);
    }
    return output;
}
