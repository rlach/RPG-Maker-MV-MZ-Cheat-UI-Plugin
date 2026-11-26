import { TAG_TYPE } from './constants.js';

function stripTranslationTags(value, tagManager) {
    let text = String(value || '');
    for (const entry of tagManager?.tagEntries || []) {
        text = text.replace(new RegExp(entry.prePattern.source, 'gi'), '');
    }
    return text.replace(/\\[{}]/g, '').replace(/<br\s*\/?\s*>/gi, '');
}

/**
 * Strip tags whose values are not meant to be translated (no-parameter, numeric,
 * and masked custom-parameter tags), while keeping the inner value of unmasked
 * custom-parameter tags so untranslated tag payloads still count as text.
 */
function stripNonTranslatableTags(value, tagManager) {
    let text = String(value || '');
    for (const entry of tagManager?.tagEntries || []) {
        const pattern = new RegExp(entry.prePattern.source, 'gi');
        if (entry.type === TAG_TYPE.WITH_CUSTOM_PARAMETER && !entry.maskValue) {
            text = text.replace(pattern, (_match, inner) =>
                typeof inner === 'string' ? inner : ''
            );
        } else {
            text = text.replace(pattern, '');
        }
    }
    return text.replace(/\\[{}]/g, '').replace(/<br\s*\/?\s*>/gi, '');
}

function hasTranslatableContentForIdenticalCheck(value, tagManager) {
    return /\p{L}/u.test(stripNonTranslatableTags(value, tagManager));
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

const CJK_LANGUAGES = new Set(['ja', 'ko', 'zh']);

function normalizeBaseLanguage(lang) {
    return String(lang || '')
        .trim()
        .toLowerCase()
        .split(/[-_]/)[0];
}

function getForeignScriptPattern(sourceLang, targetLang) {
    const sourceBase = normalizeBaseLanguage(sourceLang);
    const targetBase = normalizeBaseLanguage(targetLang);
    if (!sourceBase || !targetBase || sourceBase === targetBase || !CJK_LANGUAGES.has(sourceBase)) {
        return null;
    }

    if (!CJK_LANGUAGES.has(targetBase)) {
        return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Han}]/gu;
    }

    if (sourceBase === 'ja' && (targetBase === 'ko' || targetBase === 'zh')) {
        return /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
    }

    if (sourceBase === 'ko' && (targetBase === 'ja' || targetBase === 'zh')) {
        return /[\p{Script=Hangul}]/gu;
    }

    return null;
}

/** Advisory checks never change or reject the translated text. */
export function detectTranslationSuspicions(original, translated, tagManager, options = {}) {
    const source = stripTranslationTags(original, tagManager);
    const output = stripTranslationTags(translated, tagManager);
    const reasons = [];
    const normalizedOriginal = String(original ?? '').trim();
    const normalizedTranslated = String(translated ?? '').trim();
    if (
        normalizedOriginal.length > 0 &&
        normalizedOriginal === normalizedTranslated &&
        hasTranslatableContentForIdenticalCheck(normalizedOriginal, tagManager)
    ) {
        reasons.push({
            id: 'identical-translation',
            label: 'Identical translation',
            message: 'The translation is identical to the original text.',
        });
    }
    const foreignScriptPattern = getForeignScriptPattern(
        options?.sourceLang ?? tagManager?.runtime?.sourceLang,
        options?.targetLang ?? tagManager?.runtime?.targetLang
    );
    if (foreignScriptPattern) {
        const foreignMatches = Array.from(new Set(output.match(foreignScriptPattern) || []));
        if (foreignMatches.length > 0) {
            reasons.push({
                id: 'foreign-characters',
                label: 'Foreign characters',
                message: `The translation contains unexpected source-script characters: ${foreignMatches
                    .slice(0, 8)
                    .join('')}`,
            });
        }
    }
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
