const BRACKET_CLOSE_BY_OPEN = Object.freeze({
    '[': ']',
    '<': '>',
    '(': ')',
    '{': '}',
});

const FALLBACK_TAG_RE = /\\[A-Za-z${}|.!><^]+\[[^\]]*\]|\\[A-Za-z${}|.!><^]+/g;
const ESCAPE_TAG_SYMBOL_RE = /[A-Za-z${}|.!><^]/;
const DEFAULT_FONT_SCALE_WIDTH_MULTIPLIER = 1;

function normalizeReservedWidth(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

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
        const tagText = `\\${entry.tagSymbol}`;

        if (entry.type === 'withNumericParameter') {
            parameterized.push({
                globalPattern: new RegExp(`${escapedPrefix}\\[(\\d+)\\]`, 'gi'),
                exactPattern: new RegExp(`^${escapedPrefix}\\[(\\d+)\\]$`, 'i'),
                consumePattern: new RegExp(`^${escapedPrefix}\\[(\\d+)\\]`, 'i'),
                type: entry.type,
                tagText,
                reservedWidth: normalizeReservedWidth(entry.reservedWidth),
            });
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
                parameterized.push({
                    globalPattern: new RegExp(
                        `${escapedPrefix}${escapedOpen}[^${escapedClose}]*${escapedClose}`,
                        'gi'
                    ),
                    exactPattern: new RegExp(
                        `^${escapedPrefix}${escapedOpen}[^${escapedClose}]*${escapedClose}$`,
                        'i'
                    ),
                    consumePattern: new RegExp(
                        `^${escapedPrefix}${escapedOpen}[^${escapedClose}]*${escapedClose}`,
                        'i'
                    ),
                    type: entry.type,
                    tagText,
                    bracket: open,
                    bracketClose: close,
                    reservedWidth: normalizeReservedWidth(entry.reservedWidth),
                });
            }
            return;
        }

        withoutParameter.push({
            globalPattern: new RegExp(escapedPrefix, 'gi'),
            exactPattern: new RegExp(`^${escapedPrefix}$`, 'i'),
            consumePattern: new RegExp(`^${escapedPrefix}`, 'i'),
            type: entry.type,
            tagText,
            reservedWidth: normalizeReservedWidth(entry.reservedWidth),
        });
    });

    return { parameterized, withoutParameter };
}

function stripKnownEscapeTags(str, knownEscapeTagRegex) {
    let output = String(str || '');

    if (knownEscapeTagRegex) {
        knownEscapeTagRegex.parameterized.forEach((matcher) => {
            output = output.replace(matcher.globalPattern, '');
        });
        knownEscapeTagRegex.withoutParameter.forEach((matcher) => {
            output = output.replace(matcher.globalPattern, '');
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

function computeExtraWhitespaceWidth(text) {
    let extraWidth = 0;
    const sourceText = String(text || '');

    for (const match of sourceText.match(/[ \t]{2,}/g) || []) {
        extraWidth += match.length - 1;
    }

    return extraWidth;
}

function tryConsumeEscapeTag(sourceText, startIndex, knownEscapeTagRegex) {
    if (sourceText[startIndex] !== '\\') {
        return null;
    }

    if (knownEscapeTagRegex) {
        const remainingText = sourceText.slice(startIndex);

        for (const matcher of knownEscapeTagRegex.parameterized) {
            const matched = remainingText.match(matcher.consumePattern);
            if (!matched) {
                continue;
            }

            return {
                endIndex: startIndex + matched[0].length,
                reservedWidth: matcher.reservedWidth,
            };
        }

        for (const matcher of knownEscapeTagRegex.withoutParameter) {
            const matched = remainingText.match(matcher.consumePattern);
            if (!matched) {
                continue;
            }

            return {
                endIndex: startIndex + matched[0].length,
                reservedWidth: matcher.reservedWidth,
            };
        }

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

    return {
        endIndex: cursor,
        reservedWidth: 0,
    };
}

function measureTextWidthAndFontLevel(
    text,
    startFontLevel,
    fontScaleWidthMultiplier,
    knownEscapeTagRegex,
    font = null
) {
    const sourceText = String(text || '');
    const multiplier = resolveFontScaleWidthMultiplier(fontScaleWidthMultiplier);
    let fontLevel = Number.isFinite(startFontLevel) ? startFontLevel : 1;
    let weightedWidth = 0;
    let hasFontSizeTag = false;

    for (let i = 0; i < sourceText.length; ) {
        if (sourceText[i] === '\\') {
            const symbol = sourceText[i + 1];
            if (symbol === '{') {
                hasFontSizeTag = true;
                fontLevel = font ? font.resizeFont(fontLevel, 1) : fontLevel + 1;
                i += 2;
                continue;
            }

            if (symbol === '}') {
                hasFontSizeTag = true;
                fontLevel = font ? font.resizeFont(fontLevel, -1) : fontLevel - 1;
                i += 2;
                continue;
            }

            if (symbol === '\\') {
                weightedWidth += font ? font.measureGlyph('\\', fontLevel) : 2;
                i += 2;
                continue;
            }

            const consumedTag = tryConsumeEscapeTag(sourceText, i, knownEscapeTagRegex);
            if (font && (symbol === 'I' || symbol === 'i')) {
                const iconTag = /^\\I\[\d+\]/i.exec(sourceText.slice(i));
                if (iconTag) {
                    weightedWidth += font.iconWidth;
                    i += iconTag[0].length;
                    continue;
                }
            }
            if (symbol === 'F' || symbol === 'f') {
                const fontSizeTag = /^\\FS\[\d+\]/i.exec(sourceText.slice(i));
                if (fontSizeTag) {
                    hasFontSizeTag = true;
                    if (font) {
                        fontLevel = Math.max(1, Number(fontSizeTag[0].slice(4, -1)));
                        i += fontSizeTag[0].length;
                        continue;
                    }
                }
            }

            if (consumedTag !== null) {
                if (consumedTag.reservedWidth) {
                    weightedWidth +=
                        consumedTag.reservedWidth *
                        (font
                            ? font.measureGlyph('0', fontLevel)
                            : computeVisibleCharWidthCost(fontLevel, multiplier));
                }
                i = consumedTag.endIndex;
                continue;
            }
        }

        const character = font ? String.fromCodePoint(sourceText.codePointAt(i)) : sourceText[i];
        weightedWidth += font
            ? font.measureGlyph(character, fontLevel)
            : computeVisibleCharWidthCost(fontLevel, multiplier) *
              (character.charCodeAt(0) > 0xff ? 2 : 1);

        i += character.length;
    }

    if (!font) {
        weightedWidth += computeExtraWhitespaceWidth(
            stripKnownEscapeTags(sourceText, knownEscapeTagRegex)
        );
    }

    return { weightedWidth, fontLevel, hasFontSizeTag };
}

export function hasCachedFontSizeTags(cacheKeys, languagePrefix, tagEntries) {
    const matchers = buildKnownEscapeTagRegex(tagEntries);
    return cacheKeys.some((key) => {
        const start = key.indexOf(':') + 1;
        if (!start || !key.startsWith(languagePrefix, start)) return false;
        const text = key.slice(start + languagePrefix.length);
        return (
            /\\(?:[{}]|FS\[)/i.test(text) &&
            measureTextWidthAndFontLevel(text, 1, 1, matchers).hasFontSizeTag
        );
    });
}

function* getWrapUnits(text, matchers) {
    for (let index = 0; index < text.length; ) {
        let endIndex;
        if (text[index] === '\\') {
            const builtInTag = /^\\(?:[{}\\]|(?:I|FS)\[\d+\])/i.exec(text.slice(index));
            endIndex = builtInTag
                ? index + builtInTag[0].length
                : tryConsumeEscapeTag(text, index, matchers)?.endIndex;
        }
        endIndex ??= index + String.fromCodePoint(text.codePointAt(index)).length;
        yield text.slice(index, endIndex);
        index = endIndex;
    }
}

function getGeometryWrapTokens(text, matchers) {
    const tokens = [];
    let previousIsWhitespace;
    for (const unit of getWrapUnits(text, matchers)) {
        const isWhitespace = /^\s$/.test(unit);
        if (isWhitespace === previousIsWhitespace) tokens[tokens.length - 1] += unit;
        else tokens.push(unit);
        previousIsWhitespace = isWhitespace;
    }
    return tokens;
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
        measureTextWidthAndFontLevel(
            value,
            startFontLevel,
            fontScaleWidthMultiplier,
            knownEscapeTagRegex,
            options.font
        );

    const lines = sourceText.split('\n');
    const wrappedLines = [];
    let lineStartFontLevel = options.font?.baseFontSize ?? 1;

    for (const line of lines) {
        const fullLineMetrics = getWeightedWidthAndFontLevel(line, lineStartFontLevel);
        if (fullLineMetrics.weightedWidth <= maxWidth) {
            wrappedLines.push(line);
            lineStartFontLevel = fullLineMetrics.fontLevel;
            continue;
        }

        let currentLine = '';
        let currentLineStartFontLevel = lineStartFontLevel;
        let currentLineEndFontLevel = currentLineStartFontLevel;

        const rawTokens = options.font
            ? getGeometryWrapTokens(line, knownEscapeTagRegex)
            : line.match(/\s+|\S+/g) || [];

        const pushCurrentLine = () => {
            const trimmedLine = currentLine.trimEnd();
            if (trimmedLine) {
                wrappedLines.push(trimmedLine);
            }
            currentLineStartFontLevel = currentLineEndFontLevel;
            currentLine = '';
            currentLineEndFontLevel = currentLineStartFontLevel;
        };

        for (const token of rawTokens) {
            const testLine = currentLine ? currentLine + token : token;
            const testLineMetrics = getWeightedWidthAndFontLevel(
                testLine,
                currentLineStartFontLevel
            );

            if (testLineMetrics.weightedWidth <= maxWidth) {
                currentLine = testLine;
                currentLineEndFontLevel = testLineMetrics.fontLevel;
                continue;
            }

            if (currentLine) {
                pushCurrentLine();
            }

            if (/^\s+$/.test(token)) {
                continue;
            }

            const tokenMetrics = getWeightedWidthAndFontLevel(token, currentLineStartFontLevel);
            if (tokenMetrics.weightedWidth > maxWidth) {
                if (options.font) {
                    let lineWidth = 0;
                    for (const unit of getWrapUnits(token, knownEscapeTagRegex)) {
                        const metrics = getWeightedWidthAndFontLevel(unit, currentLineEndFontLevel);
                        if (lineWidth > 0 && lineWidth + metrics.weightedWidth > maxWidth) {
                            pushCurrentLine();
                            lineWidth = 0;
                        }
                        currentLine += unit;
                        currentLineEndFontLevel = metrics.fontLevel;
                        lineWidth += metrics.weightedWidth;
                    }
                    continue;
                }
                wrappedLines.push(token);
                currentLineStartFontLevel = tokenMetrics.fontLevel;
                currentLineEndFontLevel = currentLineStartFontLevel;
                continue;
            }

            currentLine = token;
            currentLineEndFontLevel = tokenMetrics.fontLevel;
        }

        if (currentLine) {
            wrappedLines.push(currentLine.trimEnd());
            lineStartFontLevel = currentLineEndFontLevel;
        } else {
            lineStartFontLevel = currentLineStartFontLevel;
        }
    }

    return wrappedLines.join('\n');
}

/** Measure an existing translation with the same tag/font rules as wrapping. */
export function textFitsVisibleBox(text, maxWidth, maxRows, options = {}) {
    const lines = normalizeSourceText(text, false).split('\n');
    if (lines.length > maxRows) return false;
    const tags = buildKnownEscapeTagRegex(options.tagEntries);
    let fontLevel = 1;
    for (const line of lines) {
        const metrics = measureTextWidthAndFontLevel(
            line,
            fontLevel,
            options.fontScaleWidthMultiplier,
            tags
        );
        if (metrics.weightedWidth > maxWidth) return false;
        fontLevel = metrics.fontLevel;
    }
    return true;
}
