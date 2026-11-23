function stripTranslationTags(value, tagManager) {
    let text = String(value || '');
    for (const entry of tagManager?.tagEntries || []) {
        text = text.replace(new RegExp(entry.prePattern.source, 'gi'), '');
    }
    return text.replace(/\\[{}]/g, '').replace(/<br\s*\/?\s*>/gi, '');
}

const withoutClosingQuotes = (text) => text.trim().replace(/[\s"'”’」』）)\]】»]+$/g, '');

export function isCutOffTranslation(original, translated, tagManager) {
    const source = stripTranslationTags(original, tagManager);
    const output = stripTranslationTags(translated, tagManager);
    const ending = /[.!?。！？…⋯]$/u;
    return (
        ending.test(withoutClosingQuotes(source)) &&
        /[\p{L}\p{N}]$/u.test(withoutClosingQuotes(output))
    );
}

/** Advisory checks never change or reject the translated text. */
export function detectTranslationSuspicions(original, translated, tagManager) {
    const source = stripTranslationTags(original, tagManager);
    const output = stripTranslationTags(translated, tagManager);
    const reasons = [];
    const hasExtraJsonParts = ['{', '}', '[', ']'].some(
        (part) => output.split(part).length > source.split(part).length
    );
    if (hasExtraJsonParts) {
        reasons.push({
            id: 'json-parts',
            label: 'JSON parts',
            message:
                'The translation contains more occurrences of a brace or square bracket than the original.',
        });
    }
    const contentLength = (text) => Array.from(text.replace(/[\p{P}\s⋯]/gu, '')).length;
    const sentenceLengths = (text) => {
        const normalized = withoutClosingQuotes(text).replace(/(\d)\.(?=\d)/g, '$1');
        return normalized
            .split(/[.!?。！？…⋯]+/u)
            .map(contentLength)
            .filter(Boolean);
    };
    const sourceLengths = sentenceLengths(source);
    const outputLengths = sentenceLengths(output);
    const significantSourceLengths = sourceLengths.filter((length) => length > 1);
    const missingCount = significantSourceLengths.length - outputLengths.length;
    // Cross-language counts cannot identify omitted sentences semantically.
    // Use the shortest surplus sentences to estimate the minimum missing content.
    const missingLength = significantSourceLengths
        .sort((a, b) => a - b)
        .slice(0, Math.max(0, missingCount))
        .reduce((total, length) => total + length, 0);
    if (missingCount > 0 && missingLength > contentLength(source) * 0.05) {
        reasons.push({
            id: 'fewer-sentences',
            label: 'Fewer sentences',
            message: `The original has ${sourceLengths.length} sentences, but the translation has ${outputLengths.length}.`,
        });
    }
    return reasons;
}
