/* eslint-disable no-control-regex -- RPG Maker supports ESC-prefixed localization references. */
/** Resolve DisplayI18NTexts references before keys and translation requests. */
let snapshot;
export function setDisplayI18nSourceDictionary(dictionary) {
    snapshot = dictionary;
}
export function resolveDisplayI18nSource(text, runtime) {
    if (typeof text !== 'string' || !/(?:\\|\x1b)I18N\[\d+\]/i.test(text)) return text;
    const scope = typeof window !== 'undefined' ? window : globalThis;
    if (!scope.$plugins?.some((plugin) => plugin.status && plugin.name === 'DisplayI18NTexts'))
        return text;
    const dictionary = scope.$dataI18nTexts || snapshot;
    if (!dictionary) return text;
    const requested = runtime?.sourceLang;
    const source = String(
        !requested || requested === 'auto'
            ? scope.ConfigManager?.language?.() || 'ja_JP'
            : requested
    ).replace('-', '_');
    let result = text;
    const visited = new Set();
    for (let depth = 0; depth < 12 && !visited.has(result); depth++) {
        visited.add(result);
        const next = result.replace(/(?:\\|\x1b)I18N\[(\d+)\]/gi, (token, id) => {
            const row = dictionary[Number(id)];
            if (!row) return token;
            const language = Object.keys(row).find(
                (key) => key === source || key.startsWith(source + '_')
            );
            return typeof row[language] === 'string' ? row[language] : token;
        });
        if (next === result) break;
        result = next;
    }
    return result;
}
