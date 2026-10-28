import { parseCacheKeyForLangPair } from './TranslateCacheRuntime.js';

// Older NW.js lacks RegExp match indices. Insert a zero-width suffix capture
// inside group 1 instead, preserving the original match and backreferences.
function compileNameMatcher(pattern) {
    try {
        return { regex: new RegExp(pattern, 'gid'), range: (match) => match.indices[1] };
    } catch {
        const original = new RegExp(pattern, 'gi'); // Surface actual syntax errors.
        let insertion = null;
        let groups = 0;
        let inClass = false;
        const references = [];
        for (let i = 0; i < pattern.length; i++) {
            const char = pattern[i];
            if (char === '\\') {
                const digits = !inClass && /^[1-9]\d*/.exec(pattern.slice(i + 1));
                if (digits)
                    references.push({ start: i, end: i + digits[0].length + 1, digits: digits[0] });
                i++;
            } else if (char === '[') inClass = true;
            else if (char === ']') inClass = false;
            else if (char === '(' && !inClass) {
                let start = i + 1;
                if (pattern[start] === '?') {
                    if (pattern[start + 1] !== '<' || ['=', '!'].includes(pattern[start + 2]))
                        continue;
                    start = pattern.indexOf('>', start + 2) + 1;
                }
                groups++;
                if (insertion === null) insertion = start;
            }
        }
        if (insertion === null) return { regex: original, range: () => null };
        const edits = [{ start: insertion, end: insertion, text: '(?=([\\s\\S]*))' }];
        for (const ref of references) {
            const number = Number(ref.digits);
            if (number > 1 && number <= groups) edits.push({ ...ref, text: `\\${number + 1}` });
            else if (number === groups + 1) {
                // Do not turn a legacy octal/identity escape into a new backreference.
                const octal = /^[0-3][0-7]{0,2}|^[4-7][0-7]?/.exec(ref.digits)?.[0];
                const text = octal
                    ? `\\x${parseInt(octal, 8).toString(16).padStart(2, '0')}${ref.digits.slice(octal.length)}`
                    : ref.digits;
                edits.push({ ...ref, text });
            }
        }
        let rewritten = pattern;
        for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end))
            rewritten = rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end);
        return {
            regex: new RegExp(rewritten, 'gi'),
            range: (match, text) => {
                if (match[1] === undefined || match[2] === undefined) return null;
                const start = text.length - match[2].length;
                return [start, start + match[1].length];
            },
        };
    }
}

/** Shared official-name dictionary: explicit profiles take precedence over cache. */
export function buildOfficialNameMap(runtime) {
    const sourceLang = runtime?.sourceLang || 'ja';
    const targetLang = runtime?.targetLang || 'en';
    const map = new Map();
    const profiles = runtime?.nameProfilesByLangPair?.[`${sourceLang}-${targetLang}`] || {};
    for (const [name, profile] of Object.entries(profiles)) {
        const translated =
            typeof profile?.translation === 'string' ? profile.translation.trim() : '';
        if (name && translated) map.set(name, translated);
    }
    const prefix = `actor_name:${sourceLang}-${targetLang}-`;
    for (const [key, value] of runtime?.translationCache || []) {
        if (!key.startsWith(prefix)) continue;
        const name = key.slice(prefix.length);
        const translated = typeof value === 'string' ? value.trim() : '';
        if (name && translated && !map.has(name)) map.set(name, translated);
    }
    return map;
}

/** Build a read-only plan. Match indices avoid replacing identical text outside group 1. */
export function previewNamePatternRepair(runtime, pattern) {
    if (!pattern?.trim()) throw new Error('Enter a name pattern first.');
    const matcher = compileNameMatcher(pattern);
    const names = buildOfficialNameMap(runtime);
    const changes = [];
    for (const [cacheKey, before] of runtime.translationCache) {
        if (
            !parseCacheKeyForLangPair(cacheKey, runtime.sourceLang, runtime.targetLang) ||
            typeof before !== 'string' ||
            !before
        )
            continue;
        const edits = [];
        for (const match of before.matchAll(matcher.regex)) {
            const captured = match[1];
            const range = matcher.range(match, before);
            if (!captured || !range) continue;
            const name = captured.trim();
            const translated = names.get(name);
            if (!translated || translated === name) continue;
            const replacement =
                captured.slice(0, captured.indexOf(name)) +
                translated +
                captured.slice(captured.indexOf(name) + name.length);
            if (edits.length && range[0] < edits[edits.length - 1].end) continue;
            edits.push({ start: range[0], end: range[1], replacement });
        }
        let after = before;
        for (const edit of edits.reverse())
            after = after.slice(0, edit.start) + edit.replacement + after.slice(edit.end);
        if (after !== before) changes.push({ cacheKey, before, after });
    }
    return { sourceLang: runtime.sourceLang, targetLang: runtime.targetLang, changes };
}

export function applyNamePatternRepair(runtime, plan) {
    if (runtime.sourceLang !== plan.sourceLang || runtime.targetLang !== plan.targetLang)
        throw new Error('Language pair changed. Create a new preview.');
    const changedKeys = [];
    for (const change of plan.changes) {
        // Do not overwrite translations updated while the confirmation was open.
        if (runtime.translationCache.get(change.cacheKey) !== change.before) continue;
        runtime.translationCache.set(change.cacheKey, change.after);
        changedKeys.push(change.cacheKey);
    }
    if (changedKeys.length) {
        runtime.persistCache(changedKeys);
        runtime.notifyCacheRuntime('names-pattern-repair');
    }
    return changedKeys.length;
}
