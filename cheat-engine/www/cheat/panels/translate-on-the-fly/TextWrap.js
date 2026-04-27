const BRACKET_CLOSE_BY_OPEN = Object.freeze({
    '[': ']',
    '<': '>',
    '(': ')',
    '{': '}',
});

const FALLBACK_TAG_RE = /\\[A-Za-z${}|.!><^]+\[[^\]]*\]|\\[A-Za-z${}|.!><^]+/g;

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTagEntries(tagEntries) {
    if (!Array.isArray(tagEntries)) {
        return [];
    }

    return tagEntries.filter((entry) => {
        if (!entry || typeof entry !== 'object') {
            return false;
        }
        if (typeof entry.tagSymbol !== 'string' || !entry.tagSymbol) {
            return false;
        }
        return entry.style !== 'xml';
    });
}

function buildKnownEscapeTagRegex(tagEntries) {
    const entries = normalizeTagEntries(tagEntries);
    if (entries.length === 0) {
        return null;
    }

    const sortedEntries = entries.slice().sort((a, b) => {
        return String(b.tagSymbol || '').length - String(a.tagSymbol || '').length;
    });

    const parameterized = [];
    const withoutParameter = [];

    sortedEntries.forEach((entry) => {
        const escapedSymbol = escapeRegExp(entry.tagSymbol);
        const escapedPrefix = `\\\\${escapedSymbol}`;

        if (entry.type === 'withNumericParameter') {
            parameterized.push(new RegExp(`${escapedPrefix}\\[(\\d+)\\]`, 'gi'));
            return;
        }

        if (entry.type === 'withCustomParameter') {
            const open = typeof entry.bracket === 'string' ? entry.bracket : '';
            const close =
                typeof entry.bracketClose === 'string'
                    ? entry.bracketClose
                    : BRACKET_CLOSE_BY_OPEN[open];
            if (open && close) {
                const escapedOpen = escapeRegExp(open);
                const escapedClose = escapeRegExp(close);
                parameterized.push(
                    new RegExp(
                        `${escapedPrefix}${escapedOpen}[^${escapedClose}]*${escapedClose}`,
                        'gi'
                    )
                );
            }
            return;
        }

        withoutParameter.push(new RegExp(escapedPrefix, 'gi'));
    });

    return { parameterized, withoutParameter };
}

function stripKnownEscapeTags(str, knownEscapeTagRegex) {
    let output = String(str || '');

    if (knownEscapeTagRegex) {
        knownEscapeTagRegex.parameterized.forEach((pattern) => {
            output = output.replace(pattern, '');
        });
        knownEscapeTagRegex.withoutParameter.forEach((pattern) => {
            output = output.replace(pattern, '');
        });
        return output;
    }

    return output.replace(FALLBACK_TAG_RE, '');
}

function normalizeSourceText(text, flattenExistingNewlines) {
    let sourceText = String(text || '');
    if (flattenExistingNewlines) {
        return sourceText
            .replace(/\r\n/g, '\n')
            .replace(/\n+/g, ' ')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    return sourceText.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, '\n');
}

export function wrapTextByVisibleWidth(text, maxWidth, options = {}) {
    if (!maxWidth || maxWidth <= 0) {
        return text;
    }

    const flattenExistingNewlines = !!options.flattenExistingNewlines;
    const sourceText = normalizeSourceText(text, flattenExistingNewlines);
    const knownEscapeTagRegex = buildKnownEscapeTagRegex(options.tagEntries);
    const getVisibleLength = (value) => stripKnownEscapeTags(value, knownEscapeTagRegex).length;
    const isFollowUp = (token) => {
        const visible = stripKnownEscapeTags(token, knownEscapeTagRegex);
        return visible.length === 0 || !/\w/.test(visible);
    };

    const lines = sourceText.split('\n');
    const wrappedLines = [];

    for (const line of lines) {
        if (getVisibleLength(line) <= maxWidth) {
            wrappedLines.push(line);
            continue;
        }

        const rawTokens = line.match(/\S+/g) || [];
        const units = [];
        for (const token of rawTokens) {
            if (units.length > 0 && isFollowUp(token)) {
                units[units.length - 1] += ' ' + token;
            } else {
                units.push(token);
            }
        }

        let currentLine = '';

        for (const unit of units) {
            const unitLen = getVisibleLength(unit);

            if (unitLen > maxWidth) {
                if (currentLine) {
                    wrappedLines.push(currentLine);
                    currentLine = '';
                }
                wrappedLines.push(unit);
                continue;
            }

            const testLine = currentLine ? currentLine + ' ' + unit : unit;
            if (getVisibleLength(testLine) <= maxWidth) {
                currentLine = testLine;
            } else {
                if (currentLine) {
                    wrappedLines.push(currentLine);
                }
                currentLine = unit;
            }
        }

        if (currentLine) {
            wrappedLines.push(currentLine);
        }
    }

    return wrappedLines.join('\n');
}
