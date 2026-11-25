import { guessConfigFromPattern } from '../../translate-engines/ai-engine/UnknownTagConfig.js';

export function getQuickTagConfigs(rows, registeredPatterns) {
    const specialSymbols = [...registeredPatterns]
        .map(guessConfigFromPattern)
        .filter(({ style, tagSymbol }) => style === 'escape' && /[^a-z0-9]$/i.test(tagSymbol))
        .map(({ tagSymbol }) => tagSymbol.toUpperCase());

    const configs = new Map();
    for (const { pattern } of rows) {
        if (!pattern.startsWith('\\')) continue;
        const config = guessConfigFromPattern(pattern);
        const symbol = config.tagSymbol.toUpperCase();
        if (!symbol || specialSymbols.some((prefix) => symbol.startsWith(prefix))) continue;

        if (config.type === 'withNumericParameter') {
            config.type = 'withCustomParameter';
            config.bracket = '[';
        }
        config.maskValue = config.type === 'withCustomParameter';
        const key = symbol + ':' + (config.maskValue ? config.bracket : '');
        if (!configs.has(key)) configs.set(key, config);
    }
    return [...configs.values()];
}

export function looksLikeDialogue(name) {
    if (/^[?？!！.…・\s]+$/u.test(name)) return false;
    if (/[\r\n。！？!?]|[.!?…]["'”」』）)]*$/u.test(name)) return true;

    if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(name)) {
        return (
            name.length > 24 ||
            /(?:です|でした|ます|ました|ません|ください|でしょう|だよね|だよ|だね|している|してくれ|じゃない|なんだ|なのかな)[」』）]*$/u.test(
                name
            ) ||
            /[、，]/u.test(name)
        );
    }

    return (
        name.split(/\s+/u).length > 5 ||
        /^(?:(?:i|you|we|they|he|she)\s+(?:am|are|is|was|were|can|could|will|would|have|want|need|know|think|do|did|don't|can't)|(?:what|where|when|why|how)\s+(?:is|are|do|did|can|could|would))\b/iu.test(
            name
        )
    );
}

export function chooseNamePattern(candidates, skillNames = new Set()) {
    let best = null;
    let bestRecurring = 0;
    let bestCoverage = 0;
    for (const candidate of candidates) {
        const names = new Map([...candidate.names].filter(([name]) => !looksLikeDialogue(name)));
        if (!names.size || names.size < candidate.names.size * 0.9) continue;
        let recurring = 0;
        let coverage = 0;
        for (const [name, occurrences] of names) {
            const weight = skillNames.has(name) ? 0.25 : 1;
            if (occurrences > 1) recurring += weight;
            coverage += weight;
        }
        const recurringScore = (recurring * recurring) / candidate.names.size;
        if (
            recurringScore > bestRecurring ||
            (recurringScore === bestRecurring && coverage > bestCoverage)
        ) {
            best = names.size === candidate.names.size ? candidate : { ...candidate, names };
            bestRecurring = recurringScore;
            bestCoverage = coverage;
        }
    }
    return best;
}

export function getNameDetectionEvidence(cacheKeys, languagePrefix) {
    const dialogueKeys = new Set();
    const skillNames = new Set();
    for (const key of cacheKeys) {
        const colon = key.indexOf(':');
        const type = key.slice(0, colon);
        const source = key.slice(colon + 1 + languagePrefix.length);
        if (type === 'skill_name') {
            skillNames.add(
                source
                    .trim()
                    .replace(/^【([^【】]+)】$/u, '$1')
                    .trim()
            );
        } else if (type === 'message' || type === 'message_portrait' || type === 'troop') {
            dialogueKeys.add('message:' + languagePrefix + source);
        }
    }
    return { dialogueKeys, skillNames };
}
