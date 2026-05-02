const BRACKET_CLOSE_BY_OPEN = Object.freeze({
    '[': ']',
    '<': '>',
    '(': ')',
    '{': '}',
});

const FALLBACK_TAG_RE = /\\[A-Za-z${}|.!><^]+\[[^\]]*\]|\\[A-Za-z${}|.!><^]+/g;
const ESCAPE_TAG_SYMBOL_RE = /[A-Za-z${}|.!><^]/;
const DEFAULT_FONT_SCALE_WIDTH_MULTIPLIER = 1;

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

function isShortPunctuationOnlyLine(line, knownEscapeTagRegex) {
    const trimmedLine = String(line || '').trim();
    if (!trimmedLine) {
        return false;
    }

    const visibleText = stripKnownEscapeTags(trimmedLine, knownEscapeTagRegex);
    if (!visibleText || visibleText.length > 5) {
        return false;
    }

    return /^[\p{P}\p{S}]+$/u.test(visibleText);
}

function normalizeLlmPunctuationOnlyBreaks(sourceText, knownEscapeTagRegex) {
    const lines = String(sourceText || '').split('\n');
    const mergedLines = [];

    for (const line of lines) {
        const previousLine = mergedLines.length > 0 ? mergedLines[mergedLines.length - 1] : '';
        if (
            previousLine &&
            previousLine.trim().length > 0 &&
            isShortPunctuationOnlyLine(line, knownEscapeTagRegex)
        ) {
            mergedLines[mergedLines.length - 1] = previousLine + String(line || '').trim();
            continue;
        }

        mergedLines.push(line);
    }

    return mergedLines.join('\n');
}

function resolveFontScaleWidthMultiplier(rawMultiplier) {
    const parsedMultiplier = Number(rawMultiplier);
    return Number.isFinite(parsedMultiplier) && parsedMultiplier > 0
        ? parsedMultiplier
        : DEFAULT_FONT_SCALE_WIDTH_MULTIPLIER;
}

function computeVisibleCharWidthCost(fontLevel, multiplier) {
    return Math.pow(multiplier, 1 - fontLevel);
}

function tryConsumeEscapeTag(sourceText, startIndex) {
    if (sourceText[startIndex] !== '\\') {
        return null;
    }

    const symbol = sourceText[startIndex + 1];
    if (!symbol || !ESCAPE_TAG_SYMBOL_RE.test(symbol)) {
        return null;
    }

    let cursor = startIndex + 2;
    while (cursor < sourceText.length && ESCAPE_TAG_SYMBOL_RE.test(sourceText[cursor])) {
        cursor += 1;
    }

    const bracketOpen = sourceText[cursor];
    const bracketClose = BRACKET_CLOSE_BY_OPEN[bracketOpen];
    if (bracketClose) {
        const closeIndex = sourceText.indexOf(bracketClose, cursor + 1);
        if (closeIndex !== -1) {
            cursor = closeIndex + 1;
        }
    }

    return cursor;
}

function measureTextWidthAndFontLevel(text, startFontLevel, fontScaleWidthMultiplier) {
    const sourceText = String(text || '');
    const multiplier = resolveFontScaleWidthMultiplier(fontScaleWidthMultiplier);
    let fontLevel = Number.isFinite(startFontLevel) ? startFontLevel : 1;
    let weightedWidth = 0;

    for (let i = 0; i < sourceText.length; ) {
        if (sourceText[i] === '\\') {
            const symbol = sourceText[i + 1];
            if (symbol === '{') {
                fontLevel += 1;
                i += 2;
                continue;
            }

            if (symbol === '}') {
                fontLevel -= 1;
                i += 2;
                continue;
            }

            const tagEndIndex = tryConsumeEscapeTag(sourceText, i);
            if (tagEndIndex !== null) {
                i = tagEndIndex;
                continue;
            }
        }

        weightedWidth += computeVisibleCharWidthCost(fontLevel, multiplier);
        i += 1;
    }

    return { weightedWidth, fontLevel };
}

export function wrapTextByVisibleWidth(text, maxWidth, options = {}) {
    if (!maxWidth || maxWidth <= 0) {
        return text;
    }

    const flattenExistingNewlines = !!options.flattenExistingNewlines;
    const knownEscapeTagRegex = buildKnownEscapeTagRegex(options.tagEntries);
    const fontScaleWidthMultiplier = resolveFontScaleWidthMultiplier(
        options.fontScaleWidthMultiplier
    );
    const normalizedSourceText = normalizeSourceText(text, flattenExistingNewlines);
    const sourceText = flattenExistingNewlines
        ? normalizedSourceText
        : normalizeLlmPunctuationOnlyBreaks(normalizedSourceText, knownEscapeTagRegex);
    const getWeightedWidthAndFontLevel = (value, startFontLevel) =>
        measureTextWidthAndFontLevel(value, startFontLevel, fontScaleWidthMultiplier);
    const getWeightedWidth = (value, startFontLevel) =>
        getWeightedWidthAndFontLevel(value, startFontLevel).weightedWidth;
    const isFollowUp = (token) => {
        const visible = stripKnownEscapeTags(token, knownEscapeTagRegex);
        return visible.length === 0 || !/\w/.test(visible);
    };

    const lines = sourceText.split('\n');
    const wrappedLines = [];
    let lineStartFontLevel = 1;

    for (const line of lines) {
        const fullLineMetrics = getWeightedWidthAndFontLevel(line, lineStartFontLevel);
        if (fullLineMetrics.weightedWidth <= maxWidth) {
            wrappedLines.push(line);
            lineStartFontLevel = fullLineMetrics.fontLevel;
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
        let currentLineStartFontLevel = lineStartFontLevel;
        let currentLineEndFontLevel = currentLineStartFontLevel;

        for (const unit of units) {
            const unitMetrics = getWeightedWidthAndFontLevel(unit, currentLineStartFontLevel);
            const unitLen = unitMetrics.weightedWidth;

            if (unitLen > maxWidth) {
                if (currentLine) {
                    wrappedLines.push(currentLine);
                    currentLineStartFontLevel = currentLineEndFontLevel;
                    currentLine = '';
                }
                wrappedLines.push(unit);
                currentLineStartFontLevel = unitMetrics.fontLevel;
                currentLineEndFontLevel = currentLineStartFontLevel;
                continue;
            }

            const testLine = currentLine ? currentLine + ' ' + unit : unit;
            const testLineMetrics = getWeightedWidthAndFontLevel(
                testLine,
                currentLineStartFontLevel
            );
            if (testLineMetrics.weightedWidth <= maxWidth) {
                currentLine = testLine;
                currentLineEndFontLevel = testLineMetrics.fontLevel;
            } else {
                if (currentLine) {
                    wrappedLines.push(currentLine);
                    currentLineStartFontLevel = currentLineEndFontLevel;
                }
                currentLine = unit;
                currentLineEndFontLevel = unitMetrics.fontLevel;
            }
        }

        if (currentLine) {
            wrappedLines.push(currentLine);
            lineStartFontLevel = currentLineEndFontLevel;
        } else {
            lineStartFontLevel = currentLineStartFontLevel;
        }
    }

    return wrappedLines.join('\n');
}
