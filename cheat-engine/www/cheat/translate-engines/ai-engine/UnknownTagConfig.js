const DEFAULT_TAG_OPTIONS = {
    maskValue: false,
    requiredConsistency: false,
    reservedWidth: 0,
    extraPromptForLlm: '',
    alwaysTranslate: false,
    alwaysAddToKnowledgeBase: false,
};

export function guessConfigFromPattern(pattern) {
    const xmlMatch = /^<([A-Za-z][A-Za-z0-9]*)(?::(.+))?>$/.exec(pattern);
    if (xmlMatch) {
        const sym = xmlMatch[1];
        const val = xmlMatch[2];
        let type = 'withoutParameter';
        if (val === 'N') type = 'withNumericParameter';
        else if (val === '…') type = 'withCustomParameter';
        return {
            description: sym.toLowerCase(),
            tagSymbol: sym,
            style: 'xml',
            type,
            bracket: 'none',
            ...DEFAULT_TAG_OPTIONS,
        };
    }

    const escMatch = /^\\([A-Za-z${}|.!><^][A-Za-z0-9]*)(.*)$/.exec(pattern);
    if (escMatch) {
        const sym = escMatch[1];
        const rest = escMatch[2] || '';
        let type = 'withoutParameter';
        let bracket = '<';
        if (rest === '[N]') {
            type = 'withNumericParameter';
        } else if (rest === '[…]') {
            type = 'withCustomParameter';
            bracket = '[';
        } else if (rest === '<…>') {
            type = 'withCustomParameter';
        } else if (rest === '(…)') {
            type = 'withCustomParameter';
            bracket = '(';
        } else if (rest === '{…}') {
            type = 'withCustomParameter';
            bracket = '{';
        }
        return {
            description: sym.toLowerCase(),
            tagSymbol: sym,
            style: 'escape',
            type,
            bracket,
            ...DEFAULT_TAG_OPTIONS,
        };
    }

    return {
        description: '',
        tagSymbol: '',
        style: 'escape',
        type: 'withNumericParameter',
        bracket: '<',
        ...DEFAULT_TAG_OPTIONS,
    };
}
