/** Transport syntax only. Custom tag definitions and decoded cache values are format-independent. */
export const TAG_FORMAT_OPTIONS = Object.freeze([
    { text: 'TAG delimiters: ⟪TAG:…⟫', value: 'tags' },
    { text: 'Legacy brackets: [b=…]', value: 'legacy' },
]);

const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Knowledge entries must contain names, never escaped transport tokens. */
export function containsTransportTags(text) {
    return (
        typeof text === 'string' &&
        /\bb\s*=|\[\s*\/b\s*\]|(?:⟪|<<|《)\s*\/?TAG(?:\s*:|\s*[⟫>》])/i.test(text)
    );
}

export class TagSyntax {
    constructor(format = 'tags') {
        this.format = format === 'legacy' ? 'legacy' : 'tags';
        this.open = this.format === 'legacy' ? '[b=' : '⟪TAG:';
        this.close = this.format === 'legacy' ? ']' : '⟫';
        this.closingTag = this.format === 'legacy' ? '[/b]' : '⟪/TAG⟫';
    }

    encode(payload) {
        return this.open + payload + this.close;
    }

    pattern(payload, flags = 'gi') {
        return new RegExp(escapePattern(this.open) + payload + escapePattern(this.close), flags);
    }

    prefixPattern(flags = 'gi') {
        return new RegExp(escapePattern(this.open), flags);
    }

    closingPattern() {
        return new RegExp(escapePattern(this.closingTag), 'gi');
    }

    /** Read complete tokens, respecting nested square brackets in legacy values. */
    tokens(text) {
        if (typeof text !== 'string') return [];
        const result = [];
        const pattern = this.prefixPattern();
        let match;
        while ((match = pattern.exec(text))) {
            const start = match.index;
            const valueStart = pattern.lastIndex;
            let depth = 0;
            let end = valueStart;
            for (; end < text.length; end++) {
                if (
                    this.format === 'tags' &&
                    text.slice(end, end + this.open.length).toLowerCase() ===
                        this.open.toLowerCase()
                ) {
                    depth++;
                }
                if (this.format === 'legacy' && text[end] === '[') depth++;
                if (text[end] !== this.close) continue;
                if (depth > 0) {
                    depth--;
                    continue;
                }
                break;
            }
            if (end === text.length) continue;
            result.push({ payload: text.slice(valueStart, end), index: start, end: end + 1 });
            // Also visit nested encoded tokens for unknown-tag validation.
            pattern.lastIndex = valueStart;
        }
        return result;
    }

    /** Adapt built-in and saved custom prompt examples without rewriting saved settings. */
    formatPrompt(text) {
        if (typeof text !== 'string') return text;
        const source = new TagSyntax(this.format === 'tags' ? 'legacy' : 'tags');
        const tokens = source.tokens(text);
        const replacements = new Map();
        for (const token of tokens) {
            replacements.set(token.index, { length: source.open.length, text: this.open });
            replacements.set(token.end - 1, { length: 1, text: this.close });
        }
        for (const [index, replacement] of [...replacements].sort((a, b) => b[0] - a[0])) {
            text = text.slice(0, index) + replacement.text + text.slice(index + replacement.length);
        }
        // Prompts also describe bare identifiers ("b=sn") or incomplete
        // prefixes ("[b=..."). These are instructions, not game text.
        text = text.replace(source.prefixPattern(), this.open);
        if (this.format === 'tags') {
            text = text.replace(/\bb=([a-z][a-z0-9]*|\.{3}|…)/gi, (_, payload) =>
                this.encode(payload)
            );
        }
        return text.replace(source.closingPattern(), this.closingTag);
    }
}
