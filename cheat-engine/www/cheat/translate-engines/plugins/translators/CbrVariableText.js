import { withVariableDisplayContext } from '../../../js/translation-runtime/VariableDisplayContext.js';

/** Protect display-variable expansions from CBR's script parser. Only text
 * records are copied; images and evaluated script expressions remain original.
 */
export function prepareCbrVariableText(records, readValue) {
    const tokens = new Map();
    let prefix = '\uE000CBR_VALUE_';
    while (records.some((record) => String(record.val).includes(prefix))) prefix += '_';
    const text = records.map((record) => ({
        ...record,
        val: String(record.val).replace(
            /\\(\\)|\\([VNP])\[(\d+)\]|\\(<)(.+)\\>/g,
            (tag, escaped, kind, id) => {
                if (escaped || kind !== 'V') return tag;
                const raw = readValue(Number(id));
                const display = withVariableDisplayContext(() => readValue(Number(id)));
                if (display === raw) return tag;
                const token = prefix + tokens.size + '\uE001';
                tokens.set(token, display);
                return token;
            }
        ),
    }));
    return { text, tokens };
}

export function restoreCbrVariableText(text, tokens) {
    if (typeof text !== 'string') return text;
    for (const [token, value] of tokens || []) text = text.split(token).join(String(value));
    return text;
}
